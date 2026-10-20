import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';

/** Turns database errors caused by bad input into 4xx responses instead of 500s. */
@Catch(Prisma.PrismaClientValidationError, Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(error: Prisma.PrismaClientValidationError | Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status: number = HttpStatus.BAD_REQUEST;
    let message = 'Invalid request';
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') [status, message] = [HttpStatus.CONFLICT, 'A record with these values already exists'];
      else if (error.code === 'P2025') [status, message] = [HttpStatus.NOT_FOUND, 'Record not found'];
      else if (error.code === 'P2003') message = 'Related record not found';
      else [status, message] = [HttpStatus.INTERNAL_SERVER_ERROR, 'Database error'];
    } else {
      // The last line of a validation error names the offending argument
      message = error.message.trim().split('\n').at(-1)?.slice(0, 300) || message;
    }
    res.status(status).json({ statusCode: status, message });
  }
}
