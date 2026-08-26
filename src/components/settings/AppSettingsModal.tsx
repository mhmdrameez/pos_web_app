import { useState, useEffect, useRef } from 'react'
import { Eye, EyeOff, Mail, Loader2, CheckCircle2, AlertCircle, Send, Download, Upload, HardDrive, Cloud } from 'lucide-react'
import { useAppStore } from '../../stores/useAppStore'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { getSettings, saveSettings } from '../../services/db/database'
import { sendTestEmail } from '../../services/email/emailService'
import { exportBackup, importBackup } from '../../services/db/backupRestore'
import { testSupabaseConnection, initSupabase } from '../../services/cloud/supabaseSync'
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
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Supabase state
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const [cloudEnabled, setCloudEnabled] = useState(false)
  const [showSupabaseKey, setShowSupabaseKey] = useState(false)
  const [testingCloud, setTestingCloud] = useState(false)
  const [cloudTestStatus, setCloudTestStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [cloudTestError, setCloudTestError] = useState('')

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
      if (s.supabaseSettings) {
        setSupabaseUrl(s.supabaseSettings.projectUrl)
        setSupabaseKey(s.supabaseSettings.anonKey)
        setCloudEnabled(s.supabaseSettings.enabled)
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
      const supabaseSettings = supabaseUrl.trim() && supabaseKey.trim()
        ? { projectUrl: supabaseUrl.trim(), anonKey: supabaseKey.trim(), enabled: cloudEnabled }
        : undefined
      await saveSettings({
        ...current,
        emailSettings: form.resendApiKey.trim() ? emailSettings : undefined,
        supabaseSettings,
      })

      // Re-initialize Supabase client with updated settings
      if (supabaseSettings) {
        initSupabase(supabaseSettings.projectUrl, supabaseSettings.anonKey, supabaseSettings.enabled)
      } else {
        initSupabase('', '', false)
      }

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

  async function handleTestCloud() {
    setTestingCloud(true)
    setCloudTestStatus('idle')
    try {
      const result = await testSupabaseConnection(supabaseUrl.trim(), supabaseKey.trim())
      if (result.success) {
        setCloudTestStatus('success')
        addToast('success', 'Connected to Supabase successfully!')
      } else {
        setCloudTestStatus('error')
        setCloudTestError(result.error ?? 'Unknown error')
        addToast('error', result.error ?? 'Failed to connect')
      }
    } catch {
      setCloudTestStatus('error')
      setCloudTestError('Unexpected error')
    } finally {
      setTestingCloud(false)
    }
  }

  const hasCloudConfig = supabaseUrl.trim() && supabaseKey.trim()

  async function handleBackup() {
    setBackingUp(true)
    try {
      const settings = await getSettings()
      await exportBackup(settings.businessName)
      addToast('success', 'Backup downloaded successfully')
    } catch {
      addToast('error', 'Failed to create backup')
    } finally {
      setBackingUp(false)
    }
  }

  async function handleRestore(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    // Reset the input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = ''

    const confirmed = window.confirm(
      'This will replace ALL existing data (sales, orders, settings, suggestions) with the backup file. This cannot be undone.\n\nContinue?',
    )
    if (!confirmed) return

    setRestoring(true)
    try {
      const result = await importBackup(file)
      addToast(
        'success',
        `Restored ${result.salesCount} sales, ${result.ordersCount} orders, ${result.productsCount} products`,
      )
      // Reload the page to reinitialize all stores from the restored data
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore backup'
      addToast('error', message)
    } finally {
      setRestoring(false)
    }
  }

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

        {/* Backup & Restore Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <HardDrive className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
              Data Management
            </h3>
          </div>

          <div className="space-y-3 bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500">
              Download a backup of all your data (sales, orders, settings, product suggestions) or restore from a previous backup.
            </p>

            <div className="flex items-center gap-3">
              <Button
                id="backup-btn"
                type="button"
                variant="secondary"
                onClick={handleBackup}
                disabled={backingUp || restoring}
                className="flex items-center gap-2"
              >
                {backingUp ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {backingUp ? 'Downloading…' : 'Download Backup'}
              </Button>

              <Button
                id="restore-btn"
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={backingUp || restoring}
                className="flex items-center gap-2"
              >
                {restoring ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {restoring ? 'Restoring…' : 'Restore Backup'}
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleRestore}
                className="hidden"
                aria-label="Select backup file"
              />
            </div>

            <div className="bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700">
              <strong>Warning:</strong> Restoring will replace all existing data. Make sure to download a backup first.
            </div>
          </div>
        </div>

        {/* Cloud Sync (Supabase) Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Cloud className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
              Cloud Sync (Supabase)
            </h3>
          </div>

          <div className="space-y-4 bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500">
              Optionally sync completed sales to a Supabase cloud database for backup and cross-device access.
            </p>

            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <label htmlFor="cloud-sync-toggle" className="text-sm font-medium text-gray-700">
                Enable Cloud Sync
              </label>
              <button
                id="cloud-sync-toggle"
                type="button"
                role="switch"
                aria-checked={cloudEnabled}
                onClick={() => { setCloudEnabled((v) => !v); setCloudTestStatus('idle') }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  cloudEnabled ? 'bg-indigo-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    cloudEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Project URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project URL</label>
              <input
                id="supabase-url"
                type="url"
                value={supabaseUrl}
                onChange={(e) => { setSupabaseUrl(e.target.value); setCloudTestStatus('idle') }}
                placeholder="https://yourproject.supabase.co"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
              />
            </div>

            {/* Anon Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Anon Key</label>
              <div className="relative">
                <input
                  id="supabase-anon-key"
                  type={showSupabaseKey ? 'text' : 'password'}
                  value={supabaseKey}
                  onChange={(e) => { setSupabaseKey(e.target.value); setCloudTestStatus('idle') }}
                  placeholder="eyJhbGciOiJIUzI1NiIs..."
                  autoComplete="off"
                  className="w-full pr-10 pl-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowSupabaseKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  aria-label={showSupabaseKey ? 'Hide key' : 'Show key'}
                >
                  {showSupabaseKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Find these in your{' '}
                <a
                  href="https://supabase.com/dashboard/project/_/settings/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:underline"
                >
                  Supabase project settings → API
                </a>
              </p>
            </div>

            {/* Test status */}
            {cloudTestStatus === 'success' && (
              <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Connected to Supabase successfully!
              </div>
            )}
            {cloudTestStatus === 'error' && (
              <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{cloudTestError}</span>
              </div>
            )}

            {/* Test Connection button */}
            <button
              id="test-cloud-btn"
              type="button"
              onClick={handleTestCloud}
              disabled={!hasCloudConfig || testingCloud}
              className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {testingCloud ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Cloud className="w-4 h-4" />
              )}
              {testingCloud ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
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
