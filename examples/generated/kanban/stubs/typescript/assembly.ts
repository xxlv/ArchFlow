// Generated assembly sketch for ArchFlow isolated channels.
import type { ArchFlowMessage } from './contracts';

type Handler = (message: ArchFlowMessage) => Promise<void> | void;

class InMemoryChannel {
  private handlers = new Map<string, Handler[]>();

  on(channel: string, handler: Handler) {
    const handlers = this.handlers.get(channel) ?? [];
    handlers.push(handler);
    this.handlers.set(channel, handlers);
  }

  async send(channel: string, message: ArchFlowMessage) {
    for (const handler of this.handlers.get(channel) ?? []) {
      await handler(message);
    }
  }
}

const bus = new InMemoryChannel();

bus.on('Client_UI__Task_API__Task_Backend', async (message) => {
  // TODO: route [Task_API] from @Client_UI to @Task_Backend.
  void message;
});

bus.on('Task_Backend__Task_Events__Notification_Worker', async (message) => {
  // TODO: route [Task_Events] from @Task_Backend to @Notification_Worker.
  void message;
});

export { bus };
