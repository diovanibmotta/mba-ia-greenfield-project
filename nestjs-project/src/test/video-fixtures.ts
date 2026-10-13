import { DataSource } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import { User } from '../users/entities/user.entity';

let counter = 0;

export interface UserWithChannel {
  user: User;
  channel: Channel;
}

export async function createUserWithChannel(
  dataSource: DataSource,
): Promise<UserWithChannel> {
  counter += 1;
  const unique = `${Date.now()}_${counter}`;
  const user = await dataSource.getRepository(User).save(
    dataSource.getRepository(User).create({
      email: `video_user_${unique}@example.com`,
      password: 'hashed',
      is_confirmed: true,
    }),
  );
  const channel = await dataSource.getRepository(Channel).save(
    dataSource.getRepository(Channel).create({
      name: `Channel ${unique}`,
      nickname: `chan_${unique}`,
      user_id: user.id,
    }),
  );
  return { user, channel };
}
