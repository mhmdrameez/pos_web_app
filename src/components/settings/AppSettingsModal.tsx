import { useState, useEffect } from 'react'
import { Eye, EyeOff, Mail, Loader2, CheckCircle2, AlertCircle, Send } from 'lucide-react'
import { useAppStore } from '../../stores/useAppStore'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { getSettings, saveSettings } from '../../services/db/database'
import { sendTestEmail } from '../../services/email/emailService'
import type { EmailSettings } from '../../types'

interface FormState {
  resendApiKey: string
  fromEmail: string
  toEmail: string
}

export function AppSettingsModal() {
  const isOpen = useAppStore((s) => s.isAppSettingsOpen)
  const closeAppSettings = useAppStore((s) => s.closeAppSettings)
  const addToast = useAppStore((s) => s.addToast)

  const [form, setForm] = useState<FormState>({
    resendApiKey: '',
    fromEmail: '',
    toEmail: '',
  })
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    getSettings().then((s) => {
      if (s.emailSettings) {
        setForm({
          resendApiKey: s.emailSettings.resendApiKey,
          fromEmail: s.emailSettings.fromEmail,
          toEmail: s.emailSettings.toEmail,
        })
      }
    })
  }, [isOpen])

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setTestStatus('idle')
  }

  async function handleSave() {
    setSaving(true)
    try {
      const current = await getSettings()
      const emailSettings: EmailSettings = {
        resendApiKey: form.resendApiKey.trim(),
        fromEmail: form.fromEmail.trim(),
        toEmail: form.toEmail.trim(),
      }
      await saveSettings({
        ...current,
        emailSettings: form.resendApiKey.trim() ? emailSettings : undefined,
      })
      addToast('success', 'Settings saved')
      closeAppSettings()
    } catch {
      addToast('error', 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestEmail() {
    setTesting(true)
    setTestStatus('idle')
    try {
      const current = await getSettings()
      const emailSettings: EmailSettings = {
        resendApiKey: form.resendApiKey.trim(),
        fromEmail: form.fromEmail.trim(),
        toEmail: form.toEmail.trim(),
      }
      const result = await sendTestEmail(emailSettings, current.businessName)
      if (result.success) {
        setTestStatus('success')
        addToast('success', 'Test email sent! Check your inbox.')
      } else {
        setTestStatus('error')
        setTestError(result.error ?? 'Unknown error')
        addToast('error', result.error ?? 'Failed to send test email')
      }
    } catch {
      setTestStatus('error')
      setTestError('Unexpected error')
    } finally {
      setTesting(false)
    }
  }

  const hasEmailConfig = form.resendApiKey.trim() && form.fromEmail.trim() && form.toEmail.trim()

  return (
    <Modal open={isOpen} onClose={closeAppSettings} title="Application Settings" size="md">
      <div className="space-y-6">
        {/* Email Integration Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
              Email Integration (Resend)
            </h3>
          </div>

          <div className="space-y-4 bg-gray-50 rounded-xl p-4">
            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Resend API Key
              </label>
              <div className="relative">
                <input
                  id="resend-api-key"
                  type={showKey ? 'text' : 'password'}
                  value={form.resendApiKey}
                  onChange={(e) => handleChange('resendApiKey', e.target.value)}
                  placeholder="re_••••••••••••••••"
                  autoComplete="off"
                  className="w-full pr-10 pl-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Get your key at{' '}
                <a
                  href="https://resend.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:underline"
                >
                  resend.com/api-keys
                </a>
              </p>
            </div>

            {/* From Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
              <input
                id="from-email"
                type="email"
                value={form.fromEmail}
                onChange={(e) => handleChange('fromEmail', e.target.value)}
                placeholder="pos@yourdomain.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <p className="text-xs text-gray-400 mt-1">
                Must be a verified domain in your Resend account.
              </p>
            </div>

            {/* To Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Email</label>
              <input
                id="to-email"
                type="email"
                value={form.toEmail}
                onChange={(e) => handleChange('toEmail', e.target.value)}
                placeholder="owner@yourbusiness.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <p className="text-xs text-gray-400 mt-1">
                Daily digest and individual invoices will be sent here.
              </p>
            </div>

            {/* Test Email Status */}
            {testStatus === 'success' && (
              <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Test email sent successfully!
              </div>
            )}
            {testStatus === 'error' && (
              <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{testError}</span>
              </div>
            )}

            {/* Test Email Button */}
            <button
              id="send-test-email-btn"
              type="button"
              onClick={handleTestEmail}
              disabled={!hasEmailConfig || testing}
              className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {testing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {testing ? 'Sending test...' : 'Send Test Email'}
            </button>
          </div>
        </div>

        {/* Daily Digest Info */}
        <div className="bg-indigo-50 rounded-xl px-4 py-3 text-sm text-indigo-700">
          <strong>Daily Digest:</strong> A summary of all daily invoices is automatically sent to
          the above email at <strong>10:00 PM</strong> every night (when this page is open).
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={closeAppSettings}>
            Cancel
          </Button>
          <Button
            id="save-settings-btn"
            type="button"
            variant="primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
