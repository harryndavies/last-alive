export const gameKeys = {
  game: (code: string) => ['game', code] as const,
  preview: (code: string) => ['game-preview', code] as const,
  players: (gameId: string) => ['players', gameId] as const,
  events: (gameId: string) => ['events', gameId] as const,
  kills: (gameId: string) => ['kills', gameId] as const,
  mission: (gameId: string) => ['mission', gameId] as const,
  missionHistory: (gameId: string) => ['mission-history', gameId] as const,
  myCards: (gameId: string) => ['my-cards', gameId] as const,
  claim: (killId: string) => ['kill-claim', killId] as const,
  reactions: (gameId: string) => ['reactions', gameId] as const,
  comments: (gameId: string) => ['comments', gameId] as const,
  prizes: (gameId: string) => ['prizes', gameId] as const,
}
