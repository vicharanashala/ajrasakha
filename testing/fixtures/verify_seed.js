print('users      = ' + db.users.countDocuments({firebaseUID:/^lt-/}));
print('questions  = ' + db.questions.countDocuments({}));
print('submissions= ' + db.question_submissions.countDocuments({}));
print('duplicates = ' + db.questions.countDocuments({status:'queue_duplicate'}));
print('--- sample duplicate pair ---');
const dup = db.questions.findOne({status:'queue_duplicate', originalQuestion:{$exists:true}});
printjson(dup);
print('--- index listing on questions ---');
db.questions.getIndexes().forEach(function(i){ print(i.name + ' ' + JSON.stringify(i.key)); });