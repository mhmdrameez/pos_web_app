import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCartStore } from '../../stores/useCartStore'
import { useAppStore } from '../../stores/useAppStore'
import { customerSchema, type CustomerFormData } from '../../utils/validation'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export function CustomerModal() {
  const isOpen = useAppStore((s) => s.isCustomerModalOpen)
  const closeCustomerModal = useAppStore((s) => s.closeCustomerModal)
  const addToast = useAppStore((s) => s.addToast)
  const customer = useCartStore((s) => s.customer)
  const setCustomer = useCartStore((s) => s.setCustomer)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: customer?.name ?? '',
      phone: customer?.phone ?? '',
      email: customer?.email ?? '',
    },
  })

  function onSubmit(data: CustomerFormData) {
    setCustomer({
      name: data.name,
      phone: data.phone,
      email: data.email || undefined,
    })
    addToast('success', 'Customer added')
    closeCustomerModal()
  }

  function handleClear() {
    setCustomer(null)
    reset({ name: '', phone: '', email: '' })
    addToast('info', 'Customer removed')
    closeCustomerModal()
  }

  return (
    <Modal
      open={isOpen}
      onClose={closeCustomerModal}
      title="Customer Details"
      size="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            {...register('name')}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Customer name"
          />
          {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
          <input
            {...register('phone')}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="10-digit mobile number"
            maxLength={10}
          />
          {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
          <input
            {...register('email')}
            type="email"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="email@example.com"
          />
          {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
        </div>
        <div className="flex gap-3 justify-end pt-2">
          {customer && (
            <Button type="button" variant="ghost" onClick={handleClear}>
              Clear Customer
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={closeCustomerModal}>
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
