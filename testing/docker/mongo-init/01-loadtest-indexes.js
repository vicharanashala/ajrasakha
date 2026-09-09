// =============================================================================
// MongoDB init script — runs once on first container start via the
// docker-entrypoint-initdb.d mechanism.
//
// We pre-create the indexes that the reviewer backend reads at runtime so the
// load test does not pay createIndex cost during measurement. These mirror the
// indexes the production code path depends on (see backend/src/modules/...).
// =============================================================================

const targetDb = 'agriai_loadtest';
print('init: switching to', targetDb);
db = db.getSiblingDB(targetDb);

print('init: creating users indexes');
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ firebaseUID: 1 }, { unique: true });
db.users.createIndex({ role: 1, reputation_score: 1 });
db.users.createIndex({ 'preference.state': 1, 'preference.crop': 1 });

print('init: creating questions indexes');
db.questions.createIndex({ status: 1, autoAllocateModerator: 1 });
db.questions.createIndex({ 'details.state': 1, 'details.normalised_crop': 1 });
db.questions.createIndex({ createdAt: 1 });
db.questions.createIndex({ moderatorId: 1, status: 1 });
db.questions.createIndex({ userId: 1, status: 1 });

print('init: creating question_submissions indexes');
db.question_submissions.createIndex({ questionId: 1 });
db.question_submissions.createIndex({ 'queue': 1 });
db.question_submissions.createIndex({ 'history.updatedBy': 1, 'history.status': 1 });

print('init: creating reroutes indexes');
db.reroutes.createIndex({ questionId: 1 });
db.reroutes.createIndex({ 'reroutes.reroutedTo': 1, 'reroutes.status': 1 });

print('init: all indexes created');
