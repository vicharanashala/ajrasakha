import { MongoClient, ObjectId } from 'mongodb';

// 1. Connection Configurations - Replace with your actual Atlas URIs
const STAGING_URI = '';
const PROD_URI = '';

const STAGING_DB_NAME = '';
const PROD_DB_NAME = '';

// Helper function to cleanly swap IDs using the generated map
function mapId(oldId, idMap) {
  if (!oldId) return oldId;
  const oldStr = oldId.toString();
  return idMap.has(oldStr) ? idMap.get(oldStr) : oldId;
}

async function runMigration() {
  const stagingClient = new MongoClient(STAGING_URI);
  const prodClient = new MongoClient(PROD_URI);
  let prodSession = null;

  try {
    console.log('🔄 Connecting to Atlas clusters...');
    await stagingClient.connect();
    await prodClient.connect();
    console.log('🚀 Connected successfully.\n');

    const stagingDb = stagingClient.db(STAGING_DB_NAME);
    const prodDb = prodClient.db(PROD_DB_NAME);

    // 2. Start the Production Transaction Session
    prodSession = prodClient.startSession();
    prodSession.startTransaction({
      readPreference: 'primary',
      readConcern: { level: 'local' },
      writeConcern: { w: 'majority' }
    });
    console.log('🛡️  Production database transaction started. Safeguards active.');

    // Identity Translation Maps (Old Staging ID String -> New Prod ObjectId)
    const maps = {
      users: new Map(),
      questions: new Map(),
      answers: new Map(),
      question_submissions: new Map(),
      reviews: new Map()
    };

    // ==========================================
    // 1. USERS PHASE (Map existing or create new)
    // ==========================================
    console.log('\n👥 Migrating Users...');
    const stagingUsers = await stagingDb.collection('users').find({}).toArray();
    
    for (const user of stagingUsers) {
      const oldIdStr = user._id.toString();
      let existingProdUser = null;
      
      if (user.email) {
        existingProdUser = await prodDb.collection('users').findOne({ email: user.email }, { session: prodSession });
      }

      if (existingProdUser) {
        maps.users.set(oldIdStr, existingProdUser._id);
      } else {
        const newId = new ObjectId();
        maps.users.set(oldIdStr, newId);
        const migratedUser = { ...user, _id: newId, staging: true };
        await prodDb.collection('users').insertOne(migratedUser, { session: prodSession });
      }
    }
    console.log(`✅ Users mapped/migrated: ${maps.users.size}`);

    // ==========================================
    // 2. QUESTIONS PHASE (CLOSED ONLY)
    // ==========================================
    console.log('❓ Migrating Questions (Targeting status: "closed" only)...');
    
    // CONDITION CHANGE: Select only closed questions
    const stagingQuestions = await stagingDb.collection('questions')
      .find({ status: 'closed' })
      .toArray();
    
    if (stagingQuestions.length > 0) {
      const questionOps = stagingQuestions.map(q => {
        const newId = new ObjectId();
        maps.questions.set(q._id.toString(), newId);

        q.userId = mapId(q.userId, maps.users);
        q.moderatorId = mapId(q.moderatorId, maps.users);
        q.passedBy = mapId(q.passedBy, maps.users);
        q.referenceQuestionId = mapId(q.referenceQuestionId, maps.questions);

        if (Array.isArray(q.authors_history)) {
          q.authors_history = q.authors_history.map(hist => ({
            ...hist,
            authorId: mapId(hist.authorId, maps.users),
            newAuthorId: mapId(hist.newAuthorId, maps.users)
          }));
        }

        if (Array.isArray(q.referenceQuestionDetails)) {
          q.referenceQuestionDetails = q.referenceQuestionDetails.map(ref => ({
            ...ref,
            _id: mapId(ref._id, maps.questions)
          }));
        }

        return { ...q, _id: newId, staging: true };
      });

      await prodDb.collection('questions').insertMany(questionOps, { session: prodSession });
    }
    console.log(`✅ Questions migrated to Production: ${stagingQuestions.length}`);

    // ==========================================
    // 3. ANSWERS PHASE (CASCADING FILTER)
    // ==========================================
    console.log('💬 Migrating Answers (Cascading Filter)...');
    const stagingAnswers = await stagingDb.collection('answers').find({}).toArray();

    const filteredAnswers = stagingAnswers.filter(ans => ans.questionId && maps.questions.has(ans.questionId.toString()));

    if (filteredAnswers.length > 0) {
      const answerOps = filteredAnswers.map(ans => {
        const newId = new ObjectId();
        maps.answers.set(ans._id.toString(), newId);

        ans.questionId = mapId(ans.questionId, maps.questions);
        ans.authorId = mapId(ans.authorId, maps.users);
        ans.approvedBy = mapId(ans.approvedBy, maps.users);

        if (Array.isArray(ans.modifications)) {
          ans.modifications = ans.modifications.map(mod => ({
            ...mod,
            modifiedBy: mapId(mod.modifiedBy, maps.users)
          }));
        }

        return { ...ans, _id: newId, staging: true };
      });

      await prodDb.collection('answers').insertMany(answerOps, { session: prodSession });
    }
    console.log(`✅ Answers migrated to Production: ${filteredAnswers.length} (Skipped ${stagingAnswers.length - filteredAnswers.length})`);

    // ==========================================
    // 4. REVIEWS PHASE (CASCADING FILTER)
    // ==========================================
    console.log('⭐ Migrating Reviews (Cascading Filter)...');
    const stagingReviews = await stagingDb.collection('reviews').find({}).toArray();

    const filteredReviews = stagingReviews.filter(rev => rev.questionId && maps.questions.has(rev.questionId.toString()));

    if (filteredReviews.length > 0) {
      const reviewOps = filteredReviews.map(rev => {
        const newId = new ObjectId();
        maps.reviews.set(rev._id.toString(), newId);

        rev.questionId = mapId(rev.questionId, maps.questions);
        rev.answerId = mapId(rev.answerId, maps.answers);
        rev.reviewerId = mapId(rev.reviewerId, maps.users);

        return { ...rev, _id: newId, staging: true };
      });

      await prodDb.collection('reviews').insertMany(reviewOps, { session: prodSession });
    }
    console.log(`✅ Reviews migrated to Production: ${filteredReviews.length} (Skipped ${stagingReviews.length - filteredReviews.length})`);

    // ==========================================
    // 5. QUESTION SUBMISSIONS PHASE (CASCADING FILTER)
    // ==========================================
    console.log('📝 Migrating Question Submissions (Cascading Filter)...');
    const stagingSubmissions = await stagingDb.collection('question_submissions').find({}).toArray();

    const filteredSubmissions = stagingSubmissions.filter(sub => sub.questionId && maps.questions.has(sub.questionId.toString()));

    if (filteredSubmissions.length > 0) {
      const submissionOps = filteredSubmissions.map(sub => {
        const newId = new ObjectId();
        maps.question_submissions.set(sub._id.toString(), newId);

        sub.questionId = mapId(sub.questionId, maps.questions);
        sub.lastRespondedBy = mapId(sub.lastRespondedBy, maps.users);

        if (Array.isArray(sub.queue)) {
          sub.queue = sub.queue.map(queueUser => mapId(queueUser, maps.users));
        }

        if (Array.isArray(sub.history)) {
          sub.history = sub.history.map(hist => {
            hist.updatedBy = mapId(hist.updatedBy, maps.users);
            hist.answer = mapId(hist.answer, maps.answers);
            hist.reviewId = mapId(hist.reviewId, maps.reviews);
            hist.rejectedBy = mapId(hist.rejectedBy, maps.users);
            hist.rejectedAnswer = mapId(hist.rejectedAnswer, maps.answers);
            hist.lastModifiedBy = mapId(hist.lastModifiedBy, maps.users);
            hist.modifiedAnswer = mapId(hist.modifiedAnswer, maps.answers);
            hist.approvedAnswer = mapId(hist.approvedAnswer, maps.answers);

            if (Array.isArray(hist.previousAllocations)) {
              hist.previousAllocations = hist.previousAllocations.map(alloc => ({
                ...alloc,
                reviewerId: mapId(alloc.reviewerId, maps.users)
              }));
            }
            return hist;
          });
        }

        return { ...sub, _id: newId, staging: true };
      });

      await prodDb.collection('question_submissions').insertMany(submissionOps, { session: prodSession });
    }
    console.log(`✅ Submissions migrated to Production: ${filteredSubmissions.length} (Skipped ${stagingSubmissions.length - filteredSubmissions.length})`);

    // ==========================================
    // 6. COMMIT ALL PRODUCTION OPERATIONS
    // ==========================================
    console.log('\n🚀 Committing transaction to Production Atlas...');
    await prodSession.commitTransaction();
    console.log('🎉 MIGRATION SUCCESSFULLY COMPLETED & COMMITTED TO PRODUCTION!');

    // ==========================================
    // 7. MARK STAGING RECORDS AS MIGRATED
    // ==========================================
    console.log('\n🏷️  Marking successfully migrated documents in the Staging database...');

    const migratedQuestionIds = Array.from(maps.questions.keys()).map(id => new ObjectId(id));
    const migratedAnswerIds = Array.from(maps.answers.keys()).map(id => new ObjectId(id));
    const migratedReviewIds = Array.from(maps.reviews.keys()).map(id => new ObjectId(id));
    const migratedSubmissionIds = Array.from(maps.question_submissions.keys()).map(id => new ObjectId(id));

    if (migratedQuestionIds.length > 0) {
      await stagingDb.collection('questions').updateMany(
        { _id: { $in: migratedQuestionIds } },
        { $set: { migratedToProd: true } }
      );
    }
    if (migratedAnswerIds.length > 0) {
      await stagingDb.collection('answers').updateMany(
        { _id: { $in: migratedAnswerIds } },
        { $set: { migratedToProd: true } }
      );
    }
    if (migratedReviewIds.length > 0) {
      await stagingDb.collection('reviews').updateMany(
        { _id: { $in: migratedReviewIds } },
        { $set: { migratedToProd: true } }
      );
    }
    if (migratedSubmissionIds.length > 0) {
      await stagingDb.collection('question_submissions').updateMany(
        { _id: { $in: migratedSubmissionIds } },
        { $set: { migratedToProd: true } }
      );
    }
    
    console.log('✅ Staging database successfully tagged with `migratedToProd: true` state flags.');

  } catch (error) {
    console.error('\n🔴 CRITICAL ERROR DURING MIGRATION:', error);
    if (prodSession) {
      console.log('🚨 Aborting transaction... Rolling back all writes on Production!');
      try {
        await prodSession.abortTransaction();
        console.log('🗑️  Rollback successful. Production database remains untouched.');
      } catch (abortError) {
        console.error('⚠️  Failed to cleanly abort:', abortError.message);
      }
    }
  } finally {
    if (prodSession) await prodSession.endSession();
    await stagingClient.close();
    await prodClient.close();
    console.log('🔌 Connections safely closed.');
  }
}

runMigration();