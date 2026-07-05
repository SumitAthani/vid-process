import type { NextFunction, Request, Response } from "express";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  req.log.error(err);

  res.status(500).json({
    message: "Internal Server Error",
  });
}
