import { useState, useEffect, useRef } from 'react'
import {
  Eye,
  EyeOff,
  Mail,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Send,
  Download,
  Upload,
  HardDrive,
  Cloud,
  RefreshCw,
  Database,
  Activity,
  WifiOff,
} from 'lucide-react'
import { useAppStore } from '../../stores/useAppStore'
import { Button } from '../ui/Button'
import { getSettings, saveSettings } from '../../services/db/database'
import { sqlExport, getSqliteBackupFilename } from '../../services/db/sqliteClient'
import { sendTestEmail } from '../../services/email/emailService'
import { exportBackup, importBackup } from '../../services/db/backupRestore'
import {
  testSupabaseConnection,
  initSupabase,
  syncAllPendingSales,
  subscribeCloudSyncStatus,
  getCloudSyncState,
  uploadBackupToSupabaseStorage,
} from '../../services/cloud/supabaseSync'
import type { EmailSettings } from '../../types'

interface FormState {
  resendApiKey: string
  fromEmail: string
  toEmail: string
}

export function AppSettingsView() {
  const addToast = useAppStore((s) => s.addToast)
  const showNetworkLED = useAppStore((s) => s.showNetworkLED)
  const setShowNetworkLED = useAppStore((s) => s.setShowNetworkLED)
  const forceOffline = useAppStore((s) => s.forceOffline)
  const setForceOffline = useAppStore((s) => s.setForceOffline)

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
  const [downloadingSqlite, setDownloadingSqlite] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Supabase state
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const [cloudEnabled, setCloudEnabled] = useState(false)
  const [showSupabaseKey, setShowSupabaseKey] = useState(false)
  const [testingCloud, setTestingCloud] = useState(false)
  const [cloudTestStatus, setCloudTestStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [cloudTestError, setCloudTestError] = useState('')
  const [isManualSyncing, setIsManualSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState(getCloudSyncState())
  const [backupBucketName, setBackupBucketName] = useState('')
  const [uploadingBackup, setUploadingBackup] = useState(false)
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeCloudSyncStatus((status) => {
      setSyncStatus(status)
    })
    return unsub
  }, [])

  useEffect(() => {
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
        setBackupBucketName(s.supabaseSettings.backupBucketName || '')
      }
      if (s.backupSettings?.lastBackupDate) {
        setLastBackupDate(s.backupSettings.lastBackupDate)
      }
    })
  }, [])

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
        ? {
            projectUrl: supabaseUrl.trim(),
            anonKey: supabaseKey.trim(),
            enabled: cloudEnabled,
            backupBucketName: backupBucketName.trim() || undefined,
          }
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

  async function handleManualSync() {
    setIsManualSyncing(true)
    try {
      const result = await syncAllPendingSales()
      if (result.success) {
        addToast('success', `Cloud sync complete (${result.syncedCount} sales synced)`)
      } else {
        addToast('error', result.error || 'Failed to sync to cloud')
      }
    } catch {
      addToast('error', 'Failed to sync sales to cloud')
    } finally {
      setIsManualSyncing(false)
    }
  }

  const hasCloudConfig = supabaseUrl.trim() && supabaseKey.trim()

  async function handleBackup() {
    setBackingUp(true)
    try {
      const settings = await getSettings()
      const filename = await exportBackup(settings.businessName)
      addToast('success', `Backup downloaded: ${filename}`)
    } catch {
      addToast('error', 'Failed to create backup')
    } finally {
      setBackingUp(false)
    }
  }

  async function handleUploadToSupabaseStorage() {
    setUploadingBackup(true)
    try {
      const settings = await getSettings()
      const result = await uploadBackupToSupabaseStorage(
        settings.businessName,
        backupBucketName.trim() || undefined,
      )
      if (result.success) {
        addToast('success', `SQLite file uploaded to Supabase (${result.filename})`)
        const nowIso = new Date().toISOString()
        setLastBackupDate(nowIso)
        await saveSettings({
          ...settings,
          backupSettings: {
            autoBackup10pmEnabled: settings.backupSettings?.autoBackup10pmEnabled !== false,
            autoBackupFrequency: settings.backupSettings?.autoBackupFrequency || '10pm',
            lastBackupDate: nowIso,
          },
        })
      } else {
        addToast('error', result.error || 'Failed to upload backup')
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingBackup(false)
    }
  }

  async function handleDownloadSqlite() {
    setDownloadingSqlite(true)
    try {
      const settings = await getSettings()
      const bytes = await sqlExport()
      if (!bytes || bytes.byteLength === 0) {
        throw new Error('SQLite export returned no data')
      }
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/x-sqlite3' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = getSqliteBackupFilename(settings.businessName || 'pos')
      a.click()
      URL.revokeObjectURL(url)
      addToast('success', 'SQLite database file downloaded')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addToast('error', `Failed to export SQLite file: ${msg}`)
    } finally {
      setDownloadingSqlite(false)
    }
  }

  async function handleRestore(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

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
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore backup'
      addToast('error', message)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Application Settings</h2>
      <div className="max-w-2xl space-y-6">
        {/* Email Integration Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
              Daily Digest Email (Resend)
            </h3>
          </div>

          <div className="space-y-3 bg-gray-50 rounded-xl p-4">
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
                  placeholder="re_..."
                  autoComplete="off"
                  className="w-full pr-10 pl-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                From Email Address
              </label>
              <input
                id="from-email"
                type="email"
                value={form.fromEmail}
                onChange={(e) => handleChange('fromEmail', e.target.value)}
                placeholder="pos@yourdomain.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                To Email Address
              </label>
              <input
                id="to-email"
                type="email"
                value={form.toEmail}
                onChange={(e) => handleChange('toEmail', e.target.value)}
                placeholder="owner@yourdomain.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {testStatus === 'success' && (
              <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Test email sent! Check your inbox.
              </div>
            )}
            {testStatus === 'error' && (
              <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{testError}</span>
              </div>
            )}

            <button
              id="test-email-btn"
              type="button"
              onClick={handleTestEmail}
              disabled={!hasEmailConfig || testing}
              className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {testing ? 'Sending test...' : 'Send Test Email'}
            </button>
          </div>
        </div>

        {/* Backup & Data Management Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <HardDrive className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
              Data Management & Backups
            </h3>
          </div>

          <div className="space-y-4 bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500">
              Download a JSON or SQLite copy, restore from JSON, or upload the live SQLite file to Supabase Storage. Automatic SQLite backups run at 10 PM when Cloud Sync and a backup bucket are enabled.
            </p>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                id="backup-btn"
                type="button"
                variant="secondary"
                onClick={handleBackup}
                disabled={backingUp || restoring || uploadingBackup}
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
                id="supabase-upload-btn"
                type="button"
                variant="secondary"
                onClick={handleUploadToSupabaseStorage}
                disabled={backingUp || restoring || uploadingBackup || !hasCloudConfig || !backupBucketName.trim()}
                className="flex items-center gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
              >
                {uploadingBackup ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Cloud className="w-4 h-4 text-emerald-600" />
                )}
                {uploadingBackup ? 'Uploading…' : 'Upload SQLite to Supabase'}
              </Button>

              <Button
                id="restore-btn"
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={backingUp || restoring || uploadingBackup || downloadingSqlite}
                className="flex items-center gap-2"
              >
                {restoring ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {restoring ? 'Restoring…' : 'Restore Backup'}
              </Button>

              <Button
                id="download-sqlite-btn"
                type="button"
                variant="secondary"
                onClick={handleDownloadSqlite}
                disabled={backingUp || restoring || uploadingBackup || downloadingSqlite}
                className="flex items-center gap-2 text-violet-700 border-violet-300 hover:bg-violet-50"
              >
                {downloadingSqlite ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Database className="w-4 h-4 text-violet-600" />
                )}
                {downloadingSqlite ? 'Exporting…' : 'Download SQLite DB'}
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

            {lastBackupDate && (
              <p className="text-xs text-gray-500">
                Last SQLite backup: {new Date(lastBackupDate).toLocaleString('en-IN')}
              </p>
            )}

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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Enable Cloud Sync</p>
                <p className="text-xs text-gray-400">
                  Automatically syncs all sales in real time and every 30 seconds.
                </p>
              </div>
              <button
                id="cloud-sync-toggle"
                type="button"
                role="switch"
                aria-checked={cloudEnabled}
                onClick={() => {
                  setCloudEnabled((v) => !v)
                  setCloudTestStatus('idle')
                }}
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
                onChange={(e) => {
                  setSupabaseUrl(e.target.value)
                  setCloudTestStatus('idle')
                }}
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
                  onChange={(e) => {
                    setSupabaseKey(e.target.value)
                    setCloudTestStatus('idle')
                  }}
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

            {/* Backup Bucket Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Backup Bucket Name</label>
              <input
                id="backup-bucket-name"
                type="text"
                value={backupBucketName}
                onChange={(e) => setBackupBucketName(e.target.value)}
                placeholder="backups"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">
                The Supabase Storage bucket where the SQLite file is uploaded automatically at 10 PM and when you click Upload SQLite to Supabase. Create a public or private bucket in your{' '}
                <a
                  href="https://supabase.com/dashboard/project/_/storage/buckets"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:underline"
                >
                  Supabase Storage dashboard
                </a>
              </p>
            </div>

            {/* Test and Sync status */}
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

            {syncStatus.lastSyncTimestamp && (
              <div className="text-xs text-gray-500 flex items-center justify-between">
                <span>
                  Last synced to cloud:{' '}
                  <strong>{new Date(syncStatus.lastSyncTimestamp).toLocaleTimeString()}</strong>
                </span>
                <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded font-medium">
                  Auto-sync: every 30s
                </span>
              </div>
            )}

            {/* Test Connection & Sync Now buttons */}
            <div className="flex items-center gap-4 pt-1">
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

              <button
                id="sync-now-btn"
                type="button"
                onClick={handleManualSync}
                disabled={!cloudEnabled || !hasCloudConfig || isManualSyncing || syncStatus.isSyncing}
                className="flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {isManualSyncing || syncStatus.isSyncing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {isManualSyncing || syncStatus.isSyncing ? 'Syncing...' : 'Sync All Sales Now'}
              </button>
            </div>
          </div>
        </div>

        {/* UI Preferences */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
              UI Preferences
            </h3>
          </div>

          <div className="space-y-4 bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Show Network LED</p>
                <p className="text-xs text-gray-400">
                  Displays a real-time network activity monitor in the sidebar.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showNetworkLED}
                onClick={() => setShowNetworkLED(!showNetworkLED)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  showNetworkLED ? 'bg-indigo-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    showNetworkLED ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            
            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-700">Force Offline Mode</p>
                  <WifiOff className="w-4 h-4 text-gray-400" />
                </div>
                <p className="text-xs text-gray-400">
                  Simulates offline state in the UI for testing purposes.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={forceOffline}
                onClick={() => setForceOffline(!forceOffline)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  forceOffline ? 'bg-amber-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    forceOffline ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
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
    </div>
  )
}
