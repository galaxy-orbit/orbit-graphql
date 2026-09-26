# @galaxy-stack/orbit-graphql

[![npm version](https://img.shields.io/npm/v/@galaxy-stack/orbit-graphql.svg)](https://www.npmjs.com/package/@galaxy-stack/orbit-graphql)
[![docs](https://img.shields.io/badge/docs-galaxy--orbit--framework.vercel.app-blue)](https://galaxy-orbit-framework.vercel.app)

Part of the [Orbit framework](https://github.com/galaxy-orbit/packages) — a NestJS-style backend framework for [Bun](https://bun.sh).

## Installation

```bash
bun add @galaxy-stack/orbit-graphql
```

# @galaxy-stack/orbit-graphql

## Mô tả
Module GraphQL cho Orbit với code-first approach, DataLoader support và WebSocket subscriptions.

## Tính năng chính

### 1. Code-First Decorators
```typescript
import { 
  ObjectType, Field, Query, Mutation, 
  Resolver, Args, Int 
} from '@galaxy-stack/orbit-graphql';

@ObjectType()
class User {
  @Field(() => Int)
  id!: number;

  @Field()
  name!: string;

  @Field({ nullable: true })
  email?: string;
}

@Resolver(() => User)
class UserResolver {
  @Query(() => User)
  async user(@Args('id', Int) id: number) {
    return await this.userService.findById(id);
  }

  @Query(() => [User])
  async users() {
    return await this.userService.findAll();
  }

  @Mutation(() => User)
  async createUser(@Args('input') input: CreateUserInput) {
    return await this.userService.create(input);
  }
}
```

### 2. Input Types
```typescript
@InputType()
class CreateUserInput {
  @Field()
  name!: string;

  @Field({ nullable: true })
  email?: string;
}
```

### 3. DataLoader (N+1 Prevention)
```typescript
import { createDataLoader, ResolveField, Parent } from '@galaxy-stack/orbit-graphql';

@Resolver(() => Post)
class PostResolver {
  private authorLoader = createDataLoader(
    async (ids: number[]) => this.userService.findByIds(ids)
  );

  @ResolveField(() => User)
  async author(@Parent() post: Post) {
    return this.authorLoader.load(post.authorId);
  }
}
```

### 4. Subscriptions
```typescript
import { Subscription, PubSub } from '@galaxy-stack/orbit-graphql';

@Resolver()
class NotificationResolver {
  @Subscription(() => Notification)
  notificationAdded() {
    return pubSub.asyncIterator('NOTIFICATION_ADDED');
  }
}

// Publish event
pubSub.publish('NOTIFICATION_ADDED', { notificationAdded: notification });
```

## Cấu hình Module

```typescript
import { GraphQLModule } from '@galaxy-stack/orbit-graphql';

@Module({
  imports: [
    GraphQLModule.forRoot({
      autoSchemaFile: true,
      playground: true,
      subscriptions: {
        'graphql-ws': true,
      },
    }),
  ],
  providers: [UserResolver, PostResolver],
})
class AppModule {}
```

## Field Decorators

```typescript
@ObjectType()
class Product {
  @Field(() => Int)
  id!: number;

  @Field(() => Float)
  price!: number;

  @Field(() => [String])
  tags!: string[];

  @Field(() => Int, { defaultValue: 0 })
  stock!: number;

  @Field({ deprecationReason: 'Use newField instead' })
  oldField!: string;
}
```

## Enums

```typescript
import { registerEnumType } from '@galaxy-stack/orbit-graphql';

enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

registerEnumType(UserRole, { name: 'UserRole' });

@ObjectType()
class User {
  @Field(() => UserRole)
  role!: UserRole;
}
```

## Guards & Interceptors

```typescript
@UseGuards(GqlAuthGuard)
@Resolver()
class ProtectedResolver {
  @Query(() => String)
  @UseInterceptors(LoggingInterceptor)
  protected() {
    return 'Protected data';
  }
}
```
