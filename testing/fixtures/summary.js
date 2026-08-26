print(db.users.countDocuments({firebaseUID:/^lt-/}) + ' users');
print(db.questions.countDocuments({}) + ' questions');
print(db.question_submissions.countDocuments({}) + ' question_submissions');
print(db.questions.countDocuments({status:'queue_duplicate'}) + ' curated duplicates');
print(db.questions.countDocuments({status:'open'}) + ' open');
print(db.questions.countDocuments({status:'in-review'}) + ' in-review');
print(db.questions.countDocuments({status:'closed'}) + ' closed');
print(db.questions.countDocuments({status:'delayed'}) + ' delayed');