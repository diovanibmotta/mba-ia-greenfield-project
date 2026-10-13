import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OptionalJwtGuard } from './optional-jwt.guard';

function contextWith(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('OptionalJwtGuard', () => {
  let jwtService: { verifyAsync: jest.Mock };
  let guard: OptionalJwtGuard;

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    guard = new OptionalJwtGuard(jwtService as unknown as JwtService);
  });

  it('should populate request.user for a valid bearer token', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1', email: 'a@b.c' });
    const request: { headers: object; user?: unknown } = {
      headers: { authorization: 'Bearer good-token' },
    };

    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('good-token');
    expect(request.user).toEqual({ sub: 'user-1', email: 'a@b.c' });
  });

  it('should continue anonymously when no Authorization header is sent', async () => {
    const request: { headers: object; user?: unknown } = { headers: {} };

    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);

    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('should continue anonymously when the token is invalid', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt malformed'));
    const request: { headers: object; user?: unknown } = {
      headers: { authorization: 'Bearer bad-token' },
    };

    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);

    expect(request.user).toBeUndefined();
  });

  it('should ignore an Authorization header that is not a bearer token', async () => {
    const request: { headers: object; user?: unknown } = {
      headers: { authorization: 'Basic abc' },
    };

    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);

    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });
});
