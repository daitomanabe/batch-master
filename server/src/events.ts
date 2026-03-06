import type { Response } from "express";

export class EventStream {
  private readonly clients = new Set<Response>();

  private static format<T>(eventName: string, payload: T) {
    return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  }

  addClient(response: Response) {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();
    response.write("retry: 1000\n\n");

    this.clients.add(response);

    response.on("close", () => {
      this.clients.delete(response);
      response.end();
    });
  }

  emitToClient<T>(response: Response, eventName: string, payload: T) {
    response.write(EventStream.format(eventName, payload));
  }

  emit<T>(eventName: string, payload: T) {
    const body = EventStream.format(eventName, payload);

    for (const client of this.clients) {
      client.write(body);
    }
  }
}
