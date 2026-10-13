import { applyDecorators, UseGuards } from '@nestjs/common';
import { OptionalJwtGuard } from '../guards/optional-jwt.guard';
import { Public } from './public.decorator';

/** Public route that still identifies the caller when a valid bearer token is sent. */
export const OptionalAuth = () =>
  applyDecorators(Public(), UseGuards(OptionalJwtGuard));
