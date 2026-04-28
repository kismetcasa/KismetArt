import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const keyFollowing = (a: string) => `kismetart:following:${a.toLowerCase()}`
const keyFollowers = (a: string) => `kismetart:followers:${a.toLowerCase()}`

export async function follow(follower: string, target: string): Promise<void> {
  const f = follower.toLowerCase()
  const t = target.toLowerCase()
  await Promise.all([redis.sadd(keyFollowing(f), t), redis.sadd(keyFollowers(t), f)])
}

export async function unfollow(follower: string, target: string): Promise<void> {
  const f = follower.toLowerCase()
  const t = target.toLowerCase()
  await Promise.all([redis.srem(keyFollowing(f), t), redis.srem(keyFollowers(t), f)])
}

export async function isFollowing(follower: string, target: string): Promise<boolean> {
  const result = await redis.sismember(keyFollowing(follower.toLowerCase()), target.toLowerCase())
  return result === 1
}

export async function getFollowing(address: string): Promise<string[]> {
  return (await redis.smembers(keyFollowing(address.toLowerCase()))) as string[]
}

export async function getFollowers(address: string): Promise<string[]> {
  return (await redis.smembers(keyFollowers(address.toLowerCase()))) as string[]
}

export async function getFollowerCount(address: string): Promise<number> {
  return redis.scard(keyFollowers(address.toLowerCase()))
}

export async function getFollowingCount(address: string): Promise<number> {
  return redis.scard(keyFollowing(address.toLowerCase()))
}
