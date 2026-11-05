"""Direct MongoDB access for seeding state and verifying invariants.

Seeding writes the same document shapes the backend's allocation crons
produce (questions, question_submissions with queue/history), so API
scenarios can run deterministically without waiting for cron schedules.
"""
from datetime import datetime, timezone

from bson import ObjectId
from pymongo import MongoClient

from . import config

_client = None


def get_db():
    global _client
    if _client is None:
        _client = MongoClient(
            config.MONGO_URI,
            tls=True,
            tlsCAFile=config.MONGO_TLS_CA,
            serverSelectionTimeoutMS=10000,
        )
    return _client[config.DB_NAME]


def now():
    return datetime.now(timezone.utc)


def upsert_user(firebase_uid: str, email: str, role: str, first_name: str, last_name: str = "LoadTest") -> ObjectId:
    """Insert/refresh a backend user linked to a Firebase account. Returns Mongo _id."""
    db = get_db()
    res = db.users.find_one_and_update(
        {"firebaseUID": firebase_uid},
        {
            "$set": {
                "firebaseUID": firebase_uid,
                "email": email,
                "firstName": first_name,
                "lastName": last_name,
                "role": role,
                "status": "active",
                "isBlocked": False,
                "isVerified": True,
                "updatedAt": now(),
            },
            "$setOnInsert": {"reputation_score": 0, "createdAt": now()},
        },
        upsert=True,
        return_document=True,
    )
    return res["_id"]


def seed_question(text: str, asker_id: ObjectId, queue: list[ObjectId], source: str = "AJRASAKHA", opened: bool = True) -> dict:
    """Create a question + its submission doc with an expert queue, mirroring
    what QuestionService/allocation produce. Returns {questionId, submissionId}."""
    db = get_db()
    q = {
        "userId": asker_id,
        "question": text,
        "contextId": None,
        "status": "open",
        "totalAnswersCount": 0,
        "priority": "medium",
        "details": {"state": "Punjab", "district": "Ludhiana", "crop": "wheat", "season": "rabi", "domain": ["agronomy"]},
        "isAutoAllocate": False,
        "source": source,
        "embedding": [],
        "metrics": None,
        "createdAt": now(),
        "updatedAt": now(),
    }
    qid = db.questions.insert_one(q).inserted_id
    sub = {
        "questionId": qid,
        "lastRespondedBy": queue[0] if queue else asker_id,
        "history": [],
        "queue": list(queue),
        # NOTE: pre-set by default (opened=True). When this is null and source
        # is AJRASAKHA/WHATSAPP, the first answer submission calls
        # markQuestionOpenedByExpert() WITHOUT the transaction session from
        # inside an open transaction touching the same document — the
        # non-transactional write blocks on the transaction's own uncommitted
        # write and the request hangs ~60s until the txn lifetime expires.
        # `race_probe.py --mode deadlock` seeds with opened=False to reproduce
        # this (Finding #1 in REPORT.md).
        "currentExpertOpenedAt": now() if opened else None,
        "currentExpertAllocatedAt": now(),
        "createdAt": now(),
        "updatedAt": now(),
    }
    sid = db.question_submissions.insert_one(sub).inserted_id
    return {"questionId": qid, "submissionId": sid}


def assign_reviewer(question_id: ObjectId, reviewer_id: ObjectId):
    """Mimic the allocation cron handing the question to the next reviewer:
    append a history entry with updatedBy=<reviewer> and no answer."""
    db = get_db()
    db.question_submissions.update_one(
        {"questionId": question_id},
        {
            "$push": {
                "history": {
                    "updatedBy": reviewer_id,
                    "status": "in-review",
                    "createdAt": now(),
                    "updatedAt": now(),
                }
            },
            "$set": {"updatedAt": now(), "currentExpertAllocatedAt": now()},
        },
    )


def set_reputation(user_ids: list[ObjectId], value: int):
    """Pin reputation_score to a known value so per-user deltas are exact.
    (The backend floors the score at 0 via $max, so starting from a known
    positive value avoids floor ambiguity when verifying decrements.)"""
    db = get_db()
    db.users.update_many({"_id": {"$in": list(user_ids)}}, {"$set": {"reputation_score": value}})


def get_reputations(user_ids: list[ObjectId]) -> dict:
    """Return {str(_id): reputation_score} for the given users."""
    db = get_db()
    return {
        str(u["_id"]): u.get("reputation_score", 0)
        for u in db.users.find({"_id": {"$in": list(user_ids)}}, {"reputation_score": 1})
    }


def ensure_lgd_reference():
    """Upsert the state/district reference docs that the moderator-approval
    guards (ensureNormalisedLocation) validate against. Idempotent."""
    db = get_db()
    db.states.update_one(
        {"stateNameEnglish": "Punjab"},
        {"$set": {"stateNameEnglish": "Punjab"}, "$setOnInsert": {"aliases": []}},
        upsert=True,
    )
    db.districts.update_one(
        {"districtNameEnglish": "Ludhiana"},
        {"$set": {"districtNameEnglish": "Ludhiana"}, "$setOnInsert": {"aliases": []}},
        upsert=True,
    )


def set_normalised_crop(question_id: ObjectId, name: str = "Wheat"):
    """Set details.normalised_crop so ensureNormalisedCrop short-circuits
    (avoids needing a full crop-master fixture for the approval guard)."""
    db = get_db()
    db.questions.update_one({"_id": question_id}, {"$set": {"details.normalised_crop": name}})


def get_incentives(user_ids: list[ObjectId]) -> dict:
    """Return {str(_id): incentive} for the given users (missing field -> 0)."""
    db = get_db()
    return {
        str(u["_id"]): u.get("incentive", 0)
        for u in db.users.find({"_id": {"$in": list(user_ids)}}, {"incentive": 1})
    }


def get_state(question_id: ObjectId) -> dict:
    """Snapshot of everything needed to verify pipeline invariants."""
    db = get_db()
    question = db.questions.find_one({"_id": question_id})
    submission = db.question_submissions.find_one({"questionId": question_id})
    answers = list(db.answers.find({"questionId": question_id}))
    if not answers and question:
        answers = list(db.answers.find({"questionId": str(question_id)}))
    reviews = list(db.reviews.find({"questionId": str(question_id)})) + list(
        db.reviews.find({"questionId": question_id})
    )
    return {"question": question, "submission": submission, "answers": answers, "reviews": reviews}
