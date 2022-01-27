import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator((data: any, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  if (!request.user) {
    null;
  }
  if (data) {
    //console.log('UUUUUUUUUUUU');
    return request.user[data];
  }
  return request.user;
});
