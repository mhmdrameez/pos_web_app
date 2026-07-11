import { useAppStore } from '../../stores/useAppStore'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export function AppSettingsModal() {
  const isOpen = useAppStore((s) => s.isAppSettingsOpen)
  const closeAppSettings = useAppStore((s) => s.closeAppSettings)
  return (
    <Modal open={isOpen} onClose={closeAppSettings} title="Application Settings" size="md">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Invoice</label>
          <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700">
            INVOICE
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="primary" onClick={closeAppSettings}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
