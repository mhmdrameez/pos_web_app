import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAppStore } from '../../stores/useAppStore'
import { useCartStore } from '../../stores/useCartStore'
import { saveSettings } from '../../services/db/database'
import { appSettingsSchema, type AppSettingsFormData } from '../../utils/validation'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export function AppSettingsModal() {
  const isOpen = useAppStore((s) => s.isAppSettingsOpen)
  const closeAppSettings = useAppStore((s) => s.closeAppSettings)
  const addToast = useAppStore((s) => s.addToast)
  const businessName = useAppStore((s) => s.businessName)
  const taxRatePercent = useAppStore((s) => s.taxRatePercent)
  const setBusinessName = useAppStore((s) => s.setBusinessName)
  const setTaxRatePercent = useAppStore((s) => s.setTaxRatePercent)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AppSettingsFormData>({
    resolver: zodResolver(appSettingsSchema),
    values: { businessName, taxRatePercent },
  })

  async function onSubmit(data: AppSettingsFormData) {
    try {
      await saveSettings(data)
      setBusinessName(data.businessName)
      setTaxRatePercent(data.taxRatePercent)
      useCartStore.getState().setTaxRatePercent(data.taxRatePercent)
      addToast('success', 'Settings saved')
      closeAppSettings()
    } catch {
      addToast('error', 'Failed to save settings')
    }
  }

  return (
    <Modal open={isOpen} onClose={closeAppSettings} title="Application Settings" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
          <input
            {...register('businessName')}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {errors.businessName && (
            <p className="text-red-500 text-sm mt-1">{errors.businessName.message}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label>
          <input
            {...register('taxRatePercent', { valueAsNumber: true })}
            type="number"
            step="0.01"
            min="0"
            max="100"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {errors.taxRatePercent && (
            <p className="text-red-500 text-sm mt-1">{errors.taxRatePercent.message}</p>
          )}
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={closeAppSettings}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
