// IMPORTANT: routing-controllers registers routes in controller DECORATION order (the
// order these modules are first evaluated), NOT the order of the `controllers: [...]`
// array. This barrel is the single import point for every question controller, so its
// export order IS the registration order.
//
// QuestionController owns the bare `@Get('/:questionId')` param route. It MUST be exported
// LAST so its single-segment param route registers after the literal routes in sibling
// controllers (e.g. QuestionAllocationController's `/queue-details`, `/role-dashboard`).
// Otherwise `/:questionId` captures those literals and fails @IsMongoId() with a 400
// ("Invalid params"). path-to-regexp@8 removed inline route regexes, so ordering is the
// only lever here — keep QuestionController last.
export * from './QuestionIngestionController.js';
export * from './QuestionAllocationController.js';
export * from './QuestionFeedbackController.js';
export * from './QuestionPaeValidationController.js';
export * from './QuestionReportController.js';
export * from './QuestionAiController.js';
export * from './QuestionMaintenanceController.js';
export * from './QuestionController.js';
export * from './helpers/questionAuditHelper.js';
export * from './helpers/fileUploadParser.js';
