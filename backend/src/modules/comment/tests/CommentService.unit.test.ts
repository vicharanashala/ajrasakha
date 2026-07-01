import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {InternalServerError} from 'routing-controllers';

import {CommentService} from '../services/CommentService.js';

describe('CommentService', () => {
  let service: CommentService;

  const mockCommentRepo = {
    getComments: vi.fn(),
    addComment: vi.fn(),
  };

  const mockAnswerRepo = {
    getById: vi.fn(),
  };

  const mockNotificationService = {
    saveTheNotifications: vi.fn(),
  };

  const mockDatabase = {};

  beforeEach(() => {
    vi.clearAllMocks();

    service = new CommentService(
      mockCommentRepo as any,
      mockAnswerRepo as any,
      mockNotificationService as any,
      mockDatabase as any,
    );

    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      async (callback: any) => callback({}),
    );
  });

  describe('getComments', () => {
    it('returns comments successfully', async () => {
      const response = {
        comments: [
          {
            _id: 'comment-1',
            text: 'Nice answer',
          },
        ],
        total: 1,
      };

      mockCommentRepo.getComments.mockResolvedValueOnce(response);

      const result = await service.getComments('question-1', 'answer-1', 1, 10);

      expect(result).toEqual(response);

      expect(mockCommentRepo.getComments).toHaveBeenCalledWith(
        'question-1',
        'answer-1',
        1,
        10,
        expect.anything(),
      );
    });

    it('throws InternalServerError when repository throws', async () => {
      mockCommentRepo.getComments.mockRejectedValueOnce(
        new Error('Database failed'),
      );

      await expect(
        service.getComments('question-1', 'answer-1', 1, 10),
      ).rejects.toThrow(InternalServerError);
    });
  });

  describe('addComment', () => {
    beforeEach(() => {
      mockAnswerRepo.getById.mockResolvedValue({
        authorId: {
          toString: () => 'author-1',
        },
      });

      mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);
    });

    it('adds comment successfully', async () => {
      mockCommentRepo.addComment.mockResolvedValueOnce({
        _id: 'comment-1',
      });

      const result = await service.addComment(
        'question-1',
        'answer-1',
        'Sample comment',
        'user-1',
      );

      expect(result).toBe(true);

      expect(mockCommentRepo.addComment).toHaveBeenCalledWith(
        'question-1',
        'answer-1',
        'Sample comment',
        'user-1',
        expect.anything(),
      );
    });

    it('fetches answer after creating comment', async () => {
      mockCommentRepo.addComment.mockResolvedValueOnce({
        _id: 'comment-1',
      });

      await service.addComment(
        'question-1',
        'answer-1',
        'Sample comment',
        'user-1',
      );

      expect(mockAnswerRepo.getById).toHaveBeenCalledWith('answer-1');
    });

    it('creates notification after adding comment', async () => {
      mockCommentRepo.addComment.mockResolvedValueOnce({
        _id: 'comment-1',
      });

      await service.addComment(
        'question-1',
        'answer-1',
        'Sample comment',
        'user-1',
      );

      expect(mockNotificationService.saveTheNotifications).toHaveBeenCalledWith(
        'A new Comment has been added to your Answer',
        'New Comment added',
        'question-1',
        'author-1',
        'comment',
      );
    });

    it('throws InternalServerError when addComment returns null', async () => {
      mockCommentRepo.addComment.mockResolvedValueOnce(null);

      await expect(
        service.addComment(
          'question-1',
          'answer-1',
          'Sample comment',
          'user-1',
        ),
      ).rejects.toThrow(InternalServerError);
    });

    it('throws InternalServerError when repository throws', async () => {
      mockCommentRepo.addComment.mockRejectedValueOnce(
        new Error('Database failure'),
      );

      await expect(
        service.addComment(
          'question-1',
          'answer-1',
          'Sample comment',
          'user-1',
        ),
      ).rejects.toThrow(InternalServerError);
    });

    it('throws InternalServerError when answer lookup fails', async () => {
      mockCommentRepo.addComment.mockResolvedValueOnce({
        _id: 'comment-1',
      });

      mockAnswerRepo.getById.mockRejectedValueOnce(
        new Error('Answer not found'),
      );

      await expect(
        service.addComment(
          'question-1',
          'answer-1',
          'Sample comment',
          'user-1',
        ),
      ).rejects.toThrow(InternalServerError);
    });

    it('throws InternalServerError when notification creation fails', async () => {
      mockCommentRepo.addComment.mockResolvedValueOnce({
        _id: 'comment-1',
      });

      mockNotificationService.saveTheNotifications.mockRejectedValueOnce(
        new Error('Notification failed'),
      );

      await expect(
        service.addComment(
          'question-1',
          'answer-1',
          'Sample comment',
          'user-1',
        ),
      ).rejects.toThrow(InternalServerError);
    });
  });
});
