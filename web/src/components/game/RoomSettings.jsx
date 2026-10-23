import { useState } from 'react'
import { AnimatedDialog } from '../AnimatedDialog'
import { setReducedMotion, useReducedMotion } from '../../hooks/useReducedMotion'

export function RoomSettings({ game, feedback, connected, onSave, onClose }) {
  const [privateRoom, setPrivateRoom] = useState(Boolean(game.private))
  const reduce = useReducedMotion()
  const busy = feedback?.pending

  return (
    <AnimatedDialog title="Settings" onClose={onClose}>
      <form onSubmit={event => {
        event.preventDefault()
        onSave({ private: privateRoom })
      }}>
        <fieldset disabled={busy || !connected} className="flex min-w-0 flex-col gap-4">
          <label className="room-option">
            <input type="checkbox" checked={privateRoom} onChange={event => setPrivateRoom(event.target.checked)} />
            <span>Private room</span>
          </label>
          <label className="room-option border-t border-suit-dark/20 pt-4">
            <input type="checkbox" checked={reduce} onChange={event => setReducedMotion(event.target.checked)} />
            <span>Reduce Motion</span>
          </label>
          {feedback?.error && <p role="alert" className="text-sm text-suit-red">{feedback.error}</p>}
          {!connected && <p role="alert" className="text-sm text-suit-red">Reconnect before saving.</p>}
          <button type="submit" className="action-button room-save">{busy ? 'Saving…' : 'Save'}</button>
        </fieldset>
      </form>
    </AnimatedDialog>
  )
}
