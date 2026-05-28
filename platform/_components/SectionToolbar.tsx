'use client'
import './SectionToolbar.css'

const CATEGORIES: Record<string, { emoji: string; label: string }> = {
  marketing:  { emoji: '📣', label: 'Marketing' },
  product:    { emoji: '🛠️', label: 'Product' },
  growth:     { emoji: '📈', label: 'Growth' },
  community:  { emoji: '👥', label: 'Community' },
  education:  { emoji: '🎓', label: 'Education' },
}

export function SectionToolbar({
  filterType,
  filterCategory,
  filterCore,
  onType,
  onCategory,
  onCore,
}: {
  filterType: string
  filterCategory: string
  filterCore: string
  onType: (v: string) => void
  onCategory: (v: string) => void
  onCore: (v: string) => void
}) {
  return (
    <div className="dj-toolbar">
      <div className="dj-toolbar-title">
        <span className="dj-toolbar-emoji">🎯</span>
        <h2>Content Bank <span className="dj-toolbar-sub">(成品待 Review)</span></h2>
      </div>
      <div className="dj-toolbar-filters">
        <Select value={filterType} onChange={onType} label="全部类型" options={[
          { value: 'all', label: '全部类型' },
          { value: 'video', label: '🎥 video' },
          { value: 'image', label: '🖼️ image' },
          { value: 'text', label: '📝 text' },
        ]} />
        <Select value={filterCategory} onChange={onCategory} label="全部分类" options={[
          { value: 'all', label: '全部分类' },
          ...Object.entries(CATEGORIES).map(([k, v]) => ({
            value: k,
            label: `${v.emoji} ${v.label}`,
          })),
        ]} />
        <Select value={filterCore} onChange={onCore} label="全部 Core" options={[
          { value: 'all', label: '全部 Core' },
          { value: 'ContentOS', label: 'ContentOS' },
          { value: 'ManyChat', label: 'ManyChat' },
          { value: 'OPUS Clip', label: 'OPUS Clip' },
          { value: 'Meta Ads', label: 'Meta Ads' },
          { value: 'Shopify', label: 'Shopify' },
          { value: 'Canva', label: 'Canva' },
        ]} />
      </div>
      <button className="dj-toolbar-add" type="button">
        <span>＋</span>
        <span>新增 Idea</span>
      </button>
    </div>
  )
}

function Select<Opt extends { value: string; label: string }>({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: Opt[]
  label: string
}) {
  return (
    <label className="dj-select">
      <select value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span className="dj-select-caret">▾</span>
    </label>
  )
}
