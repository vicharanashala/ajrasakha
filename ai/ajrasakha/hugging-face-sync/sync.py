import os
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any
from pymongo import MongoClient
from datasets import Dataset, load_dataset
from huggingface_hub import HfApi, login
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ---------- CONFIG ----------
MONGO_URI      = os.environ["MONGO_URI"]
MONGO_DB       = os.environ["MONGO_DB"]
HF_TOKEN       = os.environ["HF_TOKEN"]
HF_ORG         = os.environ["HF_ORG"]
HF_DATASET     = os.environ.get("HF_DATASET_NAME", "golden-dataset")
COLLECTIONS    = os.environ.get("COLLECTIONS", "users,products").split(",")
STATE_COLL     = "_sync_state"  # Mongo collection that stores watermarks


class MongoToHFSync:
    def __init__(self):
        self.mongo = MongoClient(MONGO_URI)
        self.db = self.mongo[MONGO_DB]
        self.api = HfApi(token=HF_TOKEN)
        self.repo_id = f"{HF_ORG}/{HF_DATASET}"

        # Make sure the repo exists
        self.api.create_repo(
            repo_id=self.repo_id,
            repo_type="dataset",
            token=HF_TOKEN,
            exist_ok=True
        )
        logger.info(f"Target HF repo: {self.repo_id}")

    # ---------- WATERMARK ----------
    def get_last_sync(self, collection_name: str) -> datetime:
        state = self.db[STATE_COLL].find_one({"_id": collection_name})
        if state and "last_sync" in state:
            return state["last_sync"]
        # First-ever run: sync everything from epoch
        return datetime(2000, 1, 1, tzinfo=timezone.utc)

    def update_last_sync(self, collection_name: str, ts: datetime):
        self.db[STATE_COLL].update_one(
            {"_id": collection_name},
            {"$set": {"last_sync": ts, "updated_at": datetime.now(timezone.utc)}},
            upsert=True
        )

    # ---------- DATA OPS ----------
    def _serialize(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """Convert MongoDB-specific types to JSON-friendly ones."""
        doc["_id"] = str(doc["_id"])
        for k, v in list(doc.items()):
            if isinstance(v, datetime):
                doc[k] = v.isoformat()
            elif isinstance(v, (bytes, bytearray)):
                doc[k] = v.decode("utf-8", errors="ignore")
            # Extend here for other custom types if needed
        return doc

    def fetch_changes(self, collection_name: str, since: datetime) -> List[Dict]:
        """
        Fetch all docs updated after `since`.
        REQUIRES: every doc has an `updated_at` field.
        Add this either in your app or via Mongo triggers.
        """
        cursor = self.db[collection_name].find({"updated_at": {"$gt": since}})
        return [self._serialize(d) for d in cursor]

    def load_existing(self, collection_name: str) -> List[Dict]:
        """Download existing split from HF (so we can merge)."""
        try:
            ds = load_dataset(self.repo_id, split=collection_name, token=HF_TOKEN)
            return list(ds)
        except Exception as e:
            logger.warning(f"No existing data for split '{collection_name}': {e}")
            return []

    def merge(self, existing: List[Dict], new_changes: List[Dict]) -> List[Dict]:
        """Merge by _id — newer docs (in new_changes) overwrite older ones."""
        by_id = {d["_id"]: d for d in existing}
        for d in new_changes:
            by_id[d["_id"]] = d
        return list(by_id.values())

    # ---------- MAIN SYNC LOOP ----------
    def sync_collection(self, collection_name: str):
        logger.info(f"{'='*60}\nSyncing collection: {collection_name}\n{'='*60}")

        last = self.get_last_sync(collection_name)
        logger.info(f"Watermark: {last.isoformat()}")

        changes = self.fetch_changes(collection_name, last)
        logger.info(f"Found {len(changes)} new/updated docs")

        if not changes:
            logger.info("Nothing to sync ✅")
            return

        existing = self.load_existing(collection_name)
        merged   = self.merge(existing, changes)
        logger.info(f"Total docs after merge: {len(merged)}")

        # Pick newest timestamp for the new watermark
        latest_ts = max(
            datetime.fromisoformat(d["updated_at"])
            for d in changes if "updated_at" in d
        )

        # Build dataset & push
        try:
            ds = Dataset.from_list(merged)
        except Exception:
            ds = Dataset.from_pandas(pd.DataFrame(merged))

        ds.push_to_hub(
            repo_id=self.repo_id,
            split=collection_name,
            token=HF_TOKEN,
            commit_message=f"🔄 Daily sync [{collection_name}] +{len(changes)} updates"
        )

        self.update_last_sync(collection_name, latest_ts)
        logger.info(f"✅ Pushed split '{collection_name}' to {self.repo_id}")

    def run(self):
        for coll in COLLECTIONS:
            try:
                self.sync_collection(coll.strip())
            except Exception as e:
                logger.exception(f"❌ Failed to sync {coll}: {e}")
                # Continue with next collection so one failure doesn't break the whole job
        logger.info("🏁 All collections processed")


if __name__ == "__main__":
    sync = MongoToHFSync()
    sync.run()