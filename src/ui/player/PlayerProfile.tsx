'use client'

import MyBox from 'nextjs-shared/MyBox'

interface PlayerProfileProps {
  username: string
  avatar?: string
  joinDate?: string
  ratings?: Record<string, number>
}

export default function PlayerProfile({
  username,
  avatar,
  joinDate,
  ratings
}: PlayerProfileProps) {
  return (
    <MyBox title='Player Profile'>
      <div className='flex items-start gap-4'>
        {avatar && (
          <img
            src={avatar}
            alt={username}
            className='h-16 w-16 rounded-full'
          />
        )}
        <div className='flex-1'>
          <h2 className='text-sm font-bold'>{username}</h2>
          {joinDate && (
            <p className='text-xs text-gray-500'>Joined: {joinDate}</p>
          )}

          {ratings && Object.keys(ratings).length > 0 && (
            <div className='mt-2 flex flex-wrap gap-2'>
              {Object.entries(ratings).map(([control, rating]) => (
                <span
                  key={control}
                  className='rounded bg-gray-100 px-2 py-0.5 text-xs'
                >
                  {control}: {rating}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </MyBox>
  )
}
