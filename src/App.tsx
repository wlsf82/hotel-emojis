import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

type EmojiKind = 'good' | 'bad' | 'bomb'

type Spawnable = {
  kind: EmojiKind
  emoji: string
  points: number
}

function themedPoints(points: number, theme: 'day' | 'night') {
  return theme === 'night' ? -points : points
}

function windowDelta(item: Spawnable, theme: 'day' | 'night') {
  if (item.kind === 'bomb') return 0
  return themedPoints(item.points, theme)
}

type WindowCell = {
  id: number
  active: Spawnable | null
  expiresAt: number
}

type DoorDrop = {
  emoji: string
  points: number
  expiresAt: number
}

type View = 'welcome' | 'instructions' | 'game'
type InstructionsReturnTo = 'welcome' | 'game'

type FxParticle = {
  id: number
  emoji: string
  x: number
  y: number
  dx: number
  dy: number
  rot: string
  delayMs: number
}

const COLS = 2
const ROWS = 5
const CELL_COUNT = COLS * ROWS

const SPAWN_INTERVAL_MS = 1000
const CLEANUP_INTERVAL_MS = 150
const TTL_MIN_MS = 3000
const TTL_MAX_MS = 6000

const DOOR_ITEMS: Array<{ emoji: string; points: number }> = [
  { emoji: '🎁', points: 10 },
  { emoji: '🪙', points: 15 },
  { emoji: '🔑', points: 8 },
  { emoji: '❄️', points: -12 },
  { emoji: '❤️‍🩹', points: -10 }
]

const SPAWNABLES: Spawnable[] = [
  { kind: 'good', emoji: '💎', points: 5 },
  { kind: 'good', emoji: '🍀', points: 3 },
  { kind: 'good', emoji: '⭐️', points: 2 },
  { kind: 'good', emoji: '❤️', points: 1 },
  { kind: 'bad', emoji: '💀', points: -2 },
  { kind: 'bad', emoji: '😭', points: -4 },
  { kind: 'bad', emoji: '🔥', points: -1 },
  { kind: 'bomb', emoji: '💣', points: 0 }
]

function randomInt(maxExclusive: number) {
  return Math.floor(Math.random() * maxExclusive)
}

function randomIntRange(minInclusive: number, maxInclusive: number) {
  return minInclusive + randomInt(maxInclusive - minInclusive + 1)
}

function createInitialGrid(): WindowCell[] {
  return Array.from({ length: CELL_COUNT }, (_, i) => ({
    id: i,
    active: null,
    expiresAt: 0
  }))
}

function pickDoorItem() {
  return DOOR_ITEMS[randomInt(DOOR_ITEMS.length)]
}

export default function App() {
  const [view, setView] = useState<View>('welcome')
  const [instructionsReturnTo, setInstructionsReturnTo] = useState<InstructionsReturnTo>('welcome')

  const [grid, setGrid] = useState<WindowCell[]>(() => createInitialGrid())
  const [points, setPoints] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [doorDrop, setDoorDrop] = useState<DoorDrop | null>(null)
  const [doorMilestonesAwarded, setDoorMilestonesAwarded] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [runKey, setRunKey] = useState(0)

  const [fxParticles, setFxParticles] = useState<FxParticle[]>([])

  const intervalsRef = useRef<{ spawn?: number; cleanup?: number }>({})
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef<number>(Date.now())
  const pausedAtRef = useRef<number | null>(null)

  const cardRef = useRef<HTMLDivElement | null>(null)
  const windowElsRef = useRef<Map<number, HTMLDivElement | null>>(new Map())
  const doorElRef = useRef<HTMLDivElement | null>(null)
  const nextFxIdRef = useRef(1)

  const bombSeen = useMemo(() => grid.some((c) => c.active?.kind === 'bomb'), [grid])

  const secondsInMinute = elapsedSeconds % 60
  const isThemeTransitionWindow = secondsInMinute >= 55
  const theme: 'day' | 'night' = (Math.floor((elapsedSeconds + 5) / 60) % 2 === 0 ? 'day' : 'night')

  useEffect(() => {
    document.body.dataset.theme = theme
    document.body.classList.toggle('themeTransition', isThemeTransitionWindow)
  }, [theme, isThemeTransitionWindow])

  useEffect(() => {
    document.body.dataset.view = view
  }, [view])

  useEffect(() => {
    if (view !== 'game') {
      if (pausedAtRef.current == null) pausedAtRef.current = Date.now()
      return
    }

    const pausedAt = pausedAtRef.current
    if (pausedAt == null) {
      startedAtRef.current = Date.now() - elapsedSeconds * 1000
      return
    }

    const delta = Date.now() - pausedAt
    pausedAtRef.current = null
    startedAtRef.current = Date.now() - elapsedSeconds * 1000

    if (delta > 0) {
      setDoorDrop((prev) => (prev ? { ...prev, expiresAt: prev.expiresAt + delta } : prev))
      setGrid((prev) =>
        prev.map((cell) => (cell.active ? { ...cell, expiresAt: cell.expiresAt + delta } : cell))
      )
    }
  }, [view, elapsedSeconds])

  const doorMilestones = Math.floor(points / 50)

  useEffect(() => {
    if (view !== 'game') return
    if (gameOver) return
    if (doorMilestones <= 0) return
    if (doorMilestones <= doorMilestonesAwarded) return

    setDoorMilestonesAwarded(doorMilestones)
    const now = Date.now()
    const item = pickDoorItem()
    setDoorDrop({
      emoji: item.emoji,
      points: item.points,
      expiresAt: now + randomIntRange(TTL_MIN_MS, TTL_MAX_MS)
    })
  }, [doorMilestones, doorMilestonesAwarded, gameOver, view])

  useEffect(() => {
    if (view !== 'game') return
    if (gameOver) return

    const spawn = window.setInterval(() => {
      setGrid((prev) => {
        const now = Date.now()
        const emptyIndices: number[] = []

        for (let i = 0; i < prev.length; i++) {
          const cell = prev[i]
          if (!cell.active || cell.expiresAt <= now) emptyIndices.push(i)
        }

        if (emptyIndices.length === 0) return prev

        const targetIndex = emptyIndices[randomInt(emptyIndices.length)]
        const spawnable = SPAWNABLES[randomInt(SPAWNABLES.length)]

        const next = prev.slice()
        next[targetIndex] = {
          ...next[targetIndex],
          active: spawnable,
          expiresAt: now + randomIntRange(TTL_MIN_MS, TTL_MAX_MS)
        }
        return next
      })
    }, SPAWN_INTERVAL_MS)

    const cleanup = window.setInterval(() => {
      const now = Date.now()

      setDoorDrop((prev) => {
        if (!prev) return prev
        return prev.expiresAt <= now ? null : prev
      })

      setGrid((prev) => {
        let changed = false
        const next = prev.map((cell) => {
          if (cell.active && cell.expiresAt <= now) {
            changed = true
            return { ...cell, active: null, expiresAt: 0 }
          }
          return cell
        })
        return changed ? next : prev
      })
    }, CLEANUP_INTERVAL_MS)

    intervalsRef.current.spawn = spawn
    intervalsRef.current.cleanup = cleanup

    return () => {
      window.clearInterval(spawn)
      window.clearInterval(cleanup)
    }
  }, [gameOver, view])

  useEffect(() => {
    startedAtRef.current = Date.now()
    setElapsedSeconds(0)
  }, [runKey])

  useEffect(() => {
    if (gameOver) return
    if (view !== 'game') return

    const id = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000)
      setElapsedSeconds(seconds)
    }, 250)

    timerRef.current = id

    return () => {
      window.clearInterval(id)
      if (timerRef.current === id) timerRef.current = null
    }
  }, [gameOver, runKey, view])

  function formatHMS(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    const pad2 = (n: number) => String(n).padStart(2, '0')
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
  }

  function canAnimateFx() {
    if (typeof window === 'undefined') return false
    if (!('matchMedia' in window)) return true
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function spawnEmojiFireworks(emoji: string, originEl: HTMLElement | null) {
    if (view !== 'game') return
    if (!canAnimateFx()) return

    const cardEl = cardRef.current
    if (!cardEl) return

    const cardRect = cardEl.getBoundingClientRect()
    const originRect = originEl?.getBoundingClientRect()
    const ox = originRect ? originRect.left + originRect.width / 2 : cardRect.left + cardRect.width / 2
    const oy = originRect ? originRect.top + originRect.height / 2 : cardRect.top + cardRect.height / 2

    const x = ox - cardRect.left
    const y = oy - cardRect.top

    const count = 18
    const durationMs = 900
    const ids: number[] = []

    const particles: FxParticle[] = Array.from({ length: count }, () => {
      const id = nextFxIdRef.current++
      ids.push(id)

      const angle = Math.random() * Math.PI * 2
      const distance = randomIntRange(40, 120)
      const dx = Math.cos(angle) * distance
      const dy = Math.sin(angle) * distance - randomIntRange(70, 130)
      const rot = `${randomIntRange(-160, 160)}deg`
      const delayMs = randomIntRange(0, 120)

      return { id, emoji, x, y, dx, dy, rot, delayMs }
    })

    setFxParticles((prev) => prev.concat(particles))
    window.setTimeout(() => {
      setFxParticles((prev) => prev.filter((p) => !ids.includes(p.id)))
    }, durationMs + 200)
  }

  function onClickWindow(id: number) {
    if (gameOver) return
    if (view !== 'game') return

    const pickedNow = grid[id]?.active
    if (pickedNow && pickedNow.kind !== 'bomb') {
      spawnEmojiFireworks(pickedNow.emoji, windowElsRef.current.get(id) ?? null)
    }

    setGrid((prev) => {
      const cell = prev[id]
      if (!cell?.active) return prev

      const picked = cell.active

      if (picked.kind === 'bomb') {
        setGameOver(true)
        return prev.map((c) => (c.id === id ? { ...c, active: null, expiresAt: 0 } : c))
      }

      const delta = windowDelta(picked, theme)
      setPoints((p) => p + delta)

      const next = prev.slice()
      next[id] = { ...next[id], active: null, expiresAt: 0 }
      return next
    })
  }

  function restart() {
    if (intervalsRef.current.spawn) window.clearInterval(intervalsRef.current.spawn)
    if (intervalsRef.current.cleanup) window.clearInterval(intervalsRef.current.cleanup)
    intervalsRef.current = {}

    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null

    setPoints(0)
    setGameOver(false)
    setDoorDrop(null)
    setDoorMilestonesAwarded(0)
    setGrid(createInitialGrid())
    setRunKey((k) => k + 1)
  }

  function openInstructions(from: InstructionsReturnTo) {
    setInstructionsReturnTo(from)
    setView('instructions')
  }

  function startGame() {
    restart()
    setView('game')
  }

  function onClickDoor() {
    if (gameOver) return
    if (view !== 'game') return

    if (doorDrop && doorDrop.expiresAt > Date.now()) {
      spawnEmojiFireworks(doorDrop.emoji, doorElRef.current)
    }

    const now = Date.now()
    setDoorDrop((prev) => {
      if (!prev) return prev
      if (prev.expiresAt <= now) return null

      const delta = themedPoints(prev.points, theme)
      setPoints((p) => p + delta)
      return null
    })
  }

  return (
    <div className="app">
      <div className="card" ref={cardRef} style={{ position: 'relative' }}>
        <div className="fxLayer" aria-hidden="true">
          {fxParticles.map((p) => {
            const style =
              {
                left: p.x,
                top: p.y,
                ['--dx' as any]: `${p.dx}px`,
                ['--dy' as any]: `${p.dy}px`,
                ['--rot' as any]: p.rot,
                ['--delay' as any]: `${p.delayMs}ms`,
              } satisfies CSSProperties

            return (
              <span key={p.id} className="fxEmoji" style={style}>
                {p.emoji}
              </span>
            )
          })}
        </div>

        {view === 'welcome' ? (
          <div className="screen">
            <div className="screenPanel">
              <h1 className="buildingTitle">Hotel Emojis</h1>
              <p className="screenText">Ready to start?</p>
              <div className="screenActions">
                <button className="primaryBtn" onClick={() => openInstructions('welcome')}>
                  Continue
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {view === 'instructions' ? (
          <div className="screen">
            <div className="screenPanel">
              <h1 className="screenTitle">Instructions</h1>
              <ul className="screenList">
                <li>Click a window to collect what appears.</li>
                <li>Avoid the bomb — it ends the game.</li>
                <li>Day theme adds points; night theme flips points.</li>
                <li>Sometimes the door drops a bonus item.</li>
              </ul>
              <div className="screenActions">
                {instructionsReturnTo === 'game' ? (
                  <button className="primaryBtn" onClick={() => setView('game')}>
                    Back to Game
                  </button>
                ) : (
                  <button className="primaryBtn" onClick={startGame}>
                    Start Game
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {view === 'game' ? (
          <>
            <div className="hud">
              <div className="stat">
                <span>Points</span>
                <strong>{points}</strong>
              </div>
              <div className="stat">
                <span>Time</span>
                <strong>{formatHMS(elapsedSeconds)}</strong>
              </div>
            </div>

            <div className="buildingWrap">
              <div className="sky" aria-hidden="true">
                <div className="skyIcon sun" />
                <div className="skyIcon moon" />
              </div>

              <div className="building" aria-label="Building">
                <h1 className="buildingTitle">Hotel</h1>
                <h2 className="buildingSubTitle">🌞 Emojis 🌝</h2>
                <div className="windowsGrid" aria-label="Windows">
                  {grid.map((cell) => (
                    <div
                      key={cell.id}
                      className="window"
                      ref={(el) => {
                        windowElsRef.current.set(cell.id, el)
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={cell.active ? `Window with ${cell.active.emoji}` : 'Empty window'}
                      onClick={() => onClickWindow(cell.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') onClickWindow(cell.id)
                      }}
                    >
                      {cell.active ? <span className="emoji">{cell.active.emoji}</span> : null}
                    </div>
                  ))}
                </div>

                <div className="doorArea">
                  <button className="doorSign doorSignBtn" onClick={() => openInstructions('game')}>
                    Instructions
                  </button>

                  <div className="doorRow" aria-label="Door">
                    <div
                      className={doorDrop ? 'door doorHasItem' : 'door'}
                      ref={doorElRef}
                      role="button"
                      tabIndex={0}
                      aria-label={doorDrop ? `Door item ${doorDrop.emoji}` : 'Door'}
                      onClick={onClickDoor}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') onClickDoor()
                      }}
                    >
                      {doorDrop ? <span className="doorItem">{doorDrop.emoji}</span> : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {gameOver ? (
              <div className="overlay" role="dialog" aria-modal="true" aria-label="Game Over Dialog">
                <div className="gameOver">
                  <h2>Game Over</h2>
                  <div>
                    Points: <strong>{points}</strong>
                  </div>
                  <button className="primaryBtn" onClick={restart}>
                    Restart
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
