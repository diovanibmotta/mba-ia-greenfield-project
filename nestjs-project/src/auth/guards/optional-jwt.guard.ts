import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { BEARER_PREFIX } from '../auth.constants';
import { JwtPayload } from '../auth.types';

/**
 * For public routes that behave differently for signed-in callers: a valid
 * bearer token populates `request.user`; a missing or invalid one is treated
 * as anonymous and never rejects the request.
 */
@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: JwtPayload }>();
    const authHeader = request.headers?.authorization;

    if (authHeader?.startsWith(BEARER_PREFIX)) {
      try {
        request.user = await this.jwtService.verifyAsync<JwtPayload>(
          authHeader.slice(BEARER_PREFIX.length),
        );
      } catch {
        // Invalid or expired token: continue as anonymous.
      }
    }
    return true;
  }
}
