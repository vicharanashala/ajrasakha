import { EventEmitter } from 'events';
import { injectable, inject } from 'inversify';
import { DashboardService } from '../services/DashboardService.js';
import { IExpertWorkload } from '../types.js';

/**
 * Real-time event emitter for assignment updates.
 *
 * This uses Node's built-in EventEmitter so it works without any extra
 * dependencies. The events can be bridged to Socket.IO, ws, or any other
 * transport layer at the application entry point.
 *
 * Emitted events:
 *   - 'workload:updated'    (expertId, workload: IExpertWorkload)
 *   - 'stats:updated'       (stats: IAdminAssignmentStats)
 *   - 'queued'              (expertId: string)
 *   - 'activated'           (expertId: string, questionId: string)
 *   - 'frozen'              (expertId: string, questionId: string)
 *   - 'completed'           (expertId: string, questionId: string)
 *
 * Listened events:
 *   - 'assignment:workload:updated'
 *   - 'assignment:stats:updated'
 *   - 'assignment:queued'
 *   - 'assignment:activated'
 *   - 'assignment:frozen'
 *   - 'assignment:completed'
 */
@injectable()
export class AssignmentEvents extends EventEmitter {
  constructor() {
    super();
    // Allow many simultaneous listeners (default is 10)
    this.setMaxListeners(100);
  }

  /**
   * Emit workload change for an expert.
   * Call this whenever an assignment is created, frozen, completed, etc.
   */
  async emitWorkloadUpdate(
    expertId: string,
    dashboardService: DashboardService,
  ): Promise<void> {
    try {
      const workload = await dashboardService.getExpertWorkload(expertId);
      this.emit('workload:updated', expertId, workload);
      this.emit('assignment:workload:updated', { expertId, workload });
    } catch {
      // ignore — non-critical
    }
  }

  /**
   * Emit admin stats update.
   */
  async emitStatsUpdate(dashboardService: DashboardService): Promise<void> {
    try {
      const stats = await dashboardService.getAdminStats();
      this.emit('stats:updated', stats);
      this.emit('assignment:stats:updated', stats);
    } catch {
      // ignore
    }
  }

  /**
   * Emit a 'queued' event when a question enters the queue.
   */
  emitQueued(expertId: string, questionId: string): void {
    this.emit('queued', expertId, questionId);
    this.emit('assignment:queued', { expertId, questionId });
  }

  /**
   * Emit an 'activated' event when a queued/frozen item becomes active.
   */
  emitActivated(expertId: string, questionId: string): void {
    this.emit('activated', expertId, questionId);
    this.emit('assignment:activated', { expertId, questionId });
  }

  /**
   * Emit a 'frozen' event.
   */
  emitFrozen(expertId: string, questionId: string): void {
    this.emit('frozen', expertId, questionId);
    this.emit('assignment:frozen', { expertId, questionId });
  }

  /**
   * Emit a 'completed' event.
   */
  emitCompleted(expertId: string, questionId: string): void {
    this.emit('completed', expertId, questionId);
    this.emit('assignment:completed', { expertId, questionId });
  }
}

/**
 * AssignmentSocketHandler — bridge from AssignmentEvents to a real transport.
 *
 * This implementation uses EventEmitter. To use Socket.IO instead, call
 * `initialize(server)` once with an HTTP server and the events will be
 * forwarded to Socket.IO rooms. See the Socket.IO integration comment below.
 *
 * @example
 * ```ts
 * // In your server bootstrap:
 * import { Server as HttpServer } from 'http';
 * const httpServer = new HttpServer(app);
 * assignmentSocketHandler.initialize(httpServer);
 * ```
 *
 * To enable Socket.IO, install the package and uncomment the Socket.IO code
 * in the initialize() method:
 *   pnpm add socket.io
 *   pnpm add -D @types/socket.io
 */
@injectable()
export class AssignmentSocketHandler {
  constructor(
    private readonly events: AssignmentEvents,
    private readonly dashboardService: DashboardService,
  ) {
    // Forward all events to Socket.IO rooms when initialize() is called
    this.events.on('assignment:workload:updated', async (payload: any) => {
      await this.forwardWorkloadToSocketIO(payload);
    });
    this.events.on('assignment:stats:updated', async (stats: any) => {
      await this.forwardStatsToSocketIO(stats);
    });
  }

  /**
   * Initialize the transport layer. Call once from the server bootstrap.
   * Currently uses EventEmitter (no extra deps needed).
   * To enable Socket.IO:
   *   1. pnpm add socket.io
   *   2. Uncomment the Socket.IO block below
   */
  // initialize(httpServer: HttpServer): void {
  //   const io = new Server(httpServer, { cors: { origin: '*' } });
  //   io.on('connection', (socket) => {
  //     socket.on('assignment:subscribe:expert', (expertId) => socket.join(`expert:${expertId}`));
  //     socket.on('assignment:subscribe:admin', () => socket.join('admin:assignments'));
  //   });
  //   this.events.on('assignment:workload:updated', ({ expertId, workload }) => {
  //     io.to(`expert:${expertId}`).emit('assignment:workload:updated', workload);
  //   });
  //   this.events.on('assignment:stats:updated', (stats) => {
  //     io.to('admin:assignments').emit('assignment:stats:updated', stats);
  //   });
  // }

  private async forwardWorkloadToSocketIO(payload: any): Promise<void> {
    // Placeholder — activate when Socket.IO is installed
  }

  private async forwardStatsToSocketIO(stats: any): Promise<void> {
    // Placeholder — activate when Socket.IO is installed
  }
}