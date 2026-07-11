import { useAppStore } from '../../stores/useAppStore'

export function ConfirmDialog() {
  const { open, title, message, onConfirm } = useAppStore((s) => s.confirmDialog)
  const hideConfirm = useAppStore((s) => s.hideConfirm)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={hideConfirm} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={hideConfirm}
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm?.()
              hideConfirm()
            }}
            className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-hover"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
