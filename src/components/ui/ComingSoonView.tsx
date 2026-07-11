import { Construction } from 'lucide-react'

export function ComingSoonView({ title }: { title: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
      <Construction className="w-16 h-16 mb-4 opacity-50" />
      <h2 className="text-xl font-semibold text-gray-600 mb-2">{title}</h2>
      <p className="text-sm">Coming Soon</p>
    </div>
  )
}
