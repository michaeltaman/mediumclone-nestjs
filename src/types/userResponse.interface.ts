import { UserType } from '@app/types/user.type';

export interface UserResponceInterface {
  user: UserType & { token: string };
}
