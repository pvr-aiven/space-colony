export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

export class NotFoundError extends GameError {
  constructor(message: string) {
    super("NOT_FOUND", message, 404);
  }
}
