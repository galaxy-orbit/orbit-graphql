import { GraphQLSchema, parse, validate, execute, subscribe } from 'graphql';

export interface WebSocketServerOptions {
  schema: GraphQLSchema;
  context?: (ctx: { request: Request; socket: any }) => any | Promise<any>;
  onConnect?: (connectionParams: any) => any | Promise<any>;
  onDisconnect?: (context: any) => void | Promise<void>;
  keepAlive?: number;
}

interface ConnectionContext {
  socket: any;
  context: any;
  subscriptions: Map<string, AsyncIterator<any>>;
}

const GQL_CONNECTION_INIT = 'connection_init';
const GQL_CONNECTION_ACK = 'connection_ack';
const GQL_CONNECTION_ERROR = 'connection_error';
const GQL_CONNECTION_KEEP_ALIVE = 'ka';
const GQL_START = 'start';
const GQL_DATA = 'data';
const GQL_ERROR = 'error';
const GQL_COMPLETE = 'complete';
const GQL_STOP = 'stop';
const GQL_CONNECTION_TERMINATE = 'connection_terminate';

export class GraphQLWebSocketServer {
  private schema: GraphQLSchema;
  private options: WebSocketServerOptions;
  private connections: Map<any, ConnectionContext> = new Map();
  private keepAliveIntervals: Map<any, any> = new Map();

  constructor(options: WebSocketServerOptions) {
    this.schema = options.schema;
    this.options = options;
  }

  handleConnection(socket: any, request: Request): void {
    const connectionContext: ConnectionContext = {
      socket,
      context: null,
      subscriptions: new Map(),
    };
    this.connections.set(socket, connectionContext);

    socket.addEventListener('message', (event: MessageEvent) => {
      this.handleMessage(socket, event.data);
    });

    socket.addEventListener('close', () => {
      this.handleClose(socket);
    });

    socket.addEventListener('error', (error: any) => {
      console.error('WebSocket error:', error);
    });
  }

  private async handleMessage(socket: any, data: string): Promise<void> {
    const connection = this.connections.get(socket);
    if (!connection) return;

    let message: any;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    switch (message.type) {
      case GQL_CONNECTION_INIT:
        await this.handleConnectionInit(socket, message.payload);
        break;

      case GQL_START:
        await this.handleStart(socket, message.id, message.payload);
        break;

      case GQL_STOP:
        this.handleStop(socket, message.id);
        break;

      case GQL_CONNECTION_TERMINATE:
        this.handleClose(socket);
        socket.close();
        break;
    }
  }

  private async handleConnectionInit(socket: any, connectionParams: any): Promise<void> {
    const connection = this.connections.get(socket);
    if (!connection) return;

    try {
      if (this.options.onConnect) {
        connection.context = await this.options.onConnect(connectionParams);
      } else {
        connection.context = connectionParams || {};
      }

      this.sendMessage(socket, { type: GQL_CONNECTION_ACK });

      if (this.options.keepAlive) {
        const interval = setInterval(() => {
          this.sendMessage(socket, { type: GQL_CONNECTION_KEEP_ALIVE });
        }, this.options.keepAlive);
        this.keepAliveIntervals.set(socket, interval);
      }
    } catch (error: any) {
      this.sendMessage(socket, {
        type: GQL_CONNECTION_ERROR,
        payload: { message: error.message },
      });
      socket.close();
    }
  }

  private async handleStart(socket: any, operationId: string, payload: any): Promise<void> {
    const connection = this.connections.get(socket);
    if (!connection) return;

    const { query, variables, operationName } = payload;

    try {
      const document = parse(query);
      const validationErrors = validate(this.schema, document);

      if (validationErrors.length > 0) {
        this.sendMessage(socket, {
          type: GQL_ERROR,
          id: operationId,
          payload: validationErrors,
        });
        return;
      }

      const context = this.options.context
        ? await this.options.context({ request: new Request('ws://localhost'), socket })
        : {};

      const result = await subscribe({
        schema: this.schema,
        document,
        contextValue: { ...connection.context, ...context },
        variableValues: variables,
        operationName,
      });

      if (Symbol.asyncIterator in (result as any)) {
        const iterator = result as AsyncIterableIterator<any>;
        connection.subscriptions.set(operationId, iterator);

        (async () => {
          try {
            for await (const value of { [Symbol.asyncIterator]: () => iterator }) {
              if (!connection.subscriptions.has(operationId)) break;
              
              this.sendMessage(socket, {
                type: GQL_DATA,
                id: operationId,
                payload: value,
              });
            }
          } catch (error: any) {
            this.sendMessage(socket, {
              type: GQL_ERROR,
              id: operationId,
              payload: { message: error.message },
            });
          } finally {
            this.sendMessage(socket, {
              type: GQL_COMPLETE,
              id: operationId,
            });
            connection.subscriptions.delete(operationId);
          }
        })();
      } else {
        this.sendMessage(socket, {
          type: GQL_DATA,
          id: operationId,
          payload: result,
        });
        this.sendMessage(socket, {
          type: GQL_COMPLETE,
          id: operationId,
        });
      }
    } catch (error: any) {
      this.sendMessage(socket, {
        type: GQL_ERROR,
        id: operationId,
        payload: { message: error.message },
      });
    }
  }

  private handleStop(socket: any, operationId: string): void {
    const connection = this.connections.get(socket);
    if (!connection) return;

    const iterator = connection.subscriptions.get(operationId);
    if (iterator) {
      iterator.return?.();
      connection.subscriptions.delete(operationId);
    }
  }

  private async handleClose(socket: any): Promise<void> {
    const connection = this.connections.get(socket);
    if (!connection) return;

    for (const iterator of connection.subscriptions.values()) {
      iterator.return?.();
    }
    connection.subscriptions.clear();

    const keepAliveInterval = this.keepAliveIntervals.get(socket);
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      this.keepAliveIntervals.delete(socket);
    }

    if (this.options.onDisconnect) {
      await this.options.onDisconnect(connection.context);
    }

    this.connections.delete(socket);
  }

  private sendMessage(socket: any, message: any): void {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify(message));
    }
  }
}

export function createSubscriptionServer(options: WebSocketServerOptions): GraphQLWebSocketServer {
  return new GraphQLWebSocketServer(options);
}
