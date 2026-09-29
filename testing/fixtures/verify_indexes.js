print('users indexes:');
db.users.getIndexes().forEach(function(i){ print('  ' + i.name + ' ' + JSON.stringify(i.key) + (i.unique ? ' UNIQUE' : '')); });
print('questions indexes:');
db.questions.getIndexes().forEach(function(i){ print('  ' + i.name + ' ' + JSON.stringify(i.key) + (i.unique ? ' UNIQUE' : '')); });
print('question_submissions indexes:');
db.question_submissions.getIndexes().forEach(function(i){ print('  ' + i.name + ' ' + JSON.stringify(i.key)); });
print('reroutes indexes:');
db.reroutes.getIndexes().forEach(function(i){ print('  ' + i.name + ' ' + JSON.stringify(i.key)); });