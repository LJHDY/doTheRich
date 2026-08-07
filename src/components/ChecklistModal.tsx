import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChecklistResultItem, PropertyVisit } from '../types';
import { useNumberedTextarea } from '../hooks/useNumberedTextarea';
import {
  createChecklistTemplate, deleteChecklistTemplate,
  getComplexChecklist, upsertChecklistResult,
  getPropertyVisits, createPropertyVisit, updatePropertyVisit, deletePropertyVisit,
  upsertPropertyVisitResult,
} from '../services/api';
import { formatPrice } from '../types';

const VISIT_TYPES = [
  { key: 'ATMOSPHERE' as const, label: '분위기' },
  { key: 'COMPLEX'    as const, label: '단지' },
  { key: 'PROPERTY'  as const, label: '매물' },
];

type VisitTypeKey = 'ATMOSPHERE' | 'COMPLEX' | 'PROPERTY';

const RATING_LABELS: Record<string, string> = { UPPER: '상', MIDDLE: '중', LOWER: '하' };
const RATING_COLORS: Record<string, { bg: string; color: string }> = {
  UPPER:  { bg: '#ea4335', color: '#fff' },
  MIDDLE: { bg: '#f9ab00', color: '#fff' },
  LOWER:  { bg: '#1a73e8', color: '#fff' },
};

interface Props {
  complexId: number;
  complexName: string;
  onClose: () => void;
}

// 전화번호 자동 포맷 — 숫자만 추출 후 길이·앞자리 기준 구분
const formatPhone = (val: string): string => {
  const d = val.replace(/\D/g, '');
  if (d.length === 8)  return d.replace(/(\d{4})(\d{4})/, '$1-$2');
  if (d.length === 10) return d.startsWith('02')
    ? d.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3')
    : d.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  if (d.length === 11) return d.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  return val; // 해당 없는 길이는 그대로
};

// 동·호수 표시 포맷 — 이미 접미사가 있으면 그대로
const displayDong  = (v?: string) => v ? (v.endsWith('동') ? v : v + '동') : '';
const displayHosu  = (v?: string) => v ? (v.endsWith('호') || v.endsWith('호수') ? v : v + '호') : '';
// 평형 표시 포맷 — 이미 "전용"으로 시작하면 그대로
const displayArea  = (v?: string) => v ? (v.startsWith('전용') ? v : '전용 ' + v) : '';

// 매물 임장 추가/편집 폼 상태
interface VisitFormState {
  visitDate: string;
  agentName: string;
  officePhone: string;
  mobilePhone: string;
  dong: string;
  hosu: string;
  areaType: string;
  price: string; // 입력은 문자열로
  memo: string;
}

const EMPTY_FORM: VisitFormState = {
  visitDate: '', agentName: '', officePhone: '', mobilePhone: '', dong: '', hosu: '', areaType: '', price: '', memo: '',
};

const ChecklistModal: React.FC<Props> = ({ complexId, complexName, onClose }) => {
  const [items, setItems] = useState<ChecklistResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<VisitTypeKey>('ATMOSPHERE');
  const [newItemName, setNewItemName] = useState('');
  const [adding, setAdding] = useState(false);

  // 매물 임장 기록 상태
  const [visits, setVisits] = useState<PropertyVisit[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [expandedVisitId, setExpandedVisitId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVisitId, setEditingVisitId] = useState<number | null>(null);
  const [form, setForm] = useState<VisitFormState>(EMPTY_FORM);
  const [formSaving, setFormSaving] = useState(false);

  // 매물 메모 번호목록 훅 — form.memo 연동
  const handleMemoChange = useCallback((v: string) => {
    setForm(prev => ({ ...prev, memo: v }));
  }, []);
  const memoTextarea = useNumberedTextarea(form.memo, handleMemoChange);

  const loadAtmosphere = useCallback(async () => {
    setLoading(true);
    try {
      const results = await getComplexChecklist(complexId);
      setItems(results);
      const firstRatedType = VISIT_TYPES.find(vt =>
        results.some(r => r.visitType === vt.key && r.rating !== null)
      );
      if (firstRatedType) setActiveTab(firstRatedType.key);
    } catch { }
    finally { setLoading(false); }
  }, [complexId]);

  const loadVisits = useCallback(async () => {
    setVisitsLoading(true);
    try {
      const vs = await getPropertyVisits(complexId);
      setVisits(vs);
    } catch { }
    finally { setVisitsLoading(false); }
  }, [complexId]);

  useEffect(() => { loadAtmosphere(); }, [loadAtmosphere]);
  useEffect(() => {
    if (activeTab === 'PROPERTY') loadVisits();
  }, [activeTab, loadVisits]);

  // 분위기/단지 탭용 — 현재 탭 항목
  const tabItems = useMemo(() =>
    items
      .filter(i => i.visitType === activeTab)
      .sort((a, b) => a.displayOrder - b.displayOrder),
    [items, activeTab]
  );

  const orderedCategories = useMemo(() => {
    const seen = new Map<string, true>();
    const order: string[] = [];
    for (const i of tabItems) {
      const cat = i.category || '';
      if (!seen.has(cat)) { seen.set(cat, true); order.push(cat); }
    }
    const nocat = order.indexOf('');
    if (nocat !== -1 && nocat !== order.length - 1) {
      order.splice(nocat, 1);
      order.push('');
    }
    return order;
  }, [tabItems]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, ChecklistResultItem[]>();
    for (const i of tabItems) {
      const cat = i.category || '';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(i);
    }
    return map;
  }, [tabItems]);

  const hasAnyRating = items.some(i => i.rating !== null);

  const handleRate = async (templateId: number, rating: string) => {
    const current = items.find(i => i.templateId === templateId)?.rating ?? null;
    const newRating = current === rating ? null : rating;
    try {
      const updated = await upsertChecklistResult(complexId, templateId, { rating: newRating, memo: null });
      setItems(prev => prev.map(i => i.templateId === templateId ? { ...i, rating: updated.rating } : i));
    } catch { }
  };

  const handleAdd = async () => {
    const name = newItemName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      const maxOrder = tabItems.reduce((m, t) => Math.max(m, t.displayOrder), -1);
      const created = await createChecklistTemplate({ visitType: activeTab, itemName: name, displayOrder: maxOrder + 1 });
      setItems(prev => [...prev, {
        id: 0, templateId: created.id, itemName: created.itemName,
        visitType: created.visitType as VisitTypeKey,
        category: created.category,
        displayOrder: created.displayOrder, rating: null, memo: null,
      }]);
      setNewItemName('');
    } catch { }
    finally { setAdding(false); }
  };

  const handleDelete = async (templateId: number, itemName: string) => {
    if (!window.confirm(`"${itemName}" 항목을 삭제하면 모든 단지의 해당 체크 결과도 삭제됩니다.`)) return;
    try {
      await deleteChecklistTemplate(templateId);
      setItems(prev => prev.filter(i => i.templateId !== templateId));
    } catch { }
  };

  // 매물 임장 기록 핸들러

  const handleVisitRate = async (visit: PropertyVisit, templateId: number, rating: string) => {
    const current = visit.results.find(r => r.templateId === templateId)?.rating ?? null;
    const newRating = current === rating ? null : rating;
    try {
      const updated = await upsertPropertyVisitResult(complexId, visit.id, templateId, { rating: newRating });
      setVisits(prev => prev.map(v => {
        if (v.id !== visit.id) return v;
        const results = v.results.map(r => r.templateId === templateId ? { ...r, rating: updated.rating } : r);
        return { ...v, results };
      }));
    } catch { }
  };

  const openAddForm = () => {
    setForm(EMPTY_FORM);
    setEditingVisitId(null);
    setShowAddForm(true);
  };

  const openEditForm = (v: PropertyVisit) => {
    setForm({
      visitDate: v.visitDate || '',
      agentName: v.agentName || '',
      officePhone: v.officePhone || '',
      mobilePhone: v.mobilePhone || '',
      dong: v.dong || '',
      hosu: v.hosu || '',
      areaType: v.areaType || '',
      price: v.price ? String(Math.round(v.price / 10000)) : '', // 만원 단위 입력
      memo: v.memo || '',
    });
    setEditingVisitId(v.id);
    setShowAddForm(true);
  };

  const handleFormSave = async () => {
    if (formSaving) return;
    setFormSaving(true);
    try {
      const req = {
        visitDate: form.visitDate || undefined,
        agentName: form.agentName || undefined,
        officePhone: form.officePhone || undefined,
        mobilePhone: form.mobilePhone || undefined,
        dong: form.dong || undefined,
        hosu: form.hosu || undefined,
        areaType: form.areaType || undefined,
        price: form.price ? Number(form.price) * 10000 : undefined, // 만원 → 원
        memo: form.memo || undefined,
      };
      if (editingVisitId) {
        const updated = await updatePropertyVisit(complexId, editingVisitId, req);
        setVisits(prev => prev.map(v => v.id === editingVisitId ? { ...updated, results: v.results } : v));
      } else {
        const created = await createPropertyVisit(complexId, req);
        setVisits(prev => [created, ...prev]);
        setExpandedVisitId(created.id);
      }
      setShowAddForm(false);
      setEditingVisitId(null);
    } catch { }
    finally { setFormSaving(false); }
  };

  const handleDeleteVisit = async (visitId: number) => {
    if (!window.confirm('이 매물 기록을 삭제합니다. 체크리스트 결과도 함께 삭제됩니다.')) return;
    try {
      await deletePropertyVisit(complexId, visitId);
      setVisits(prev => prev.filter(v => v.id !== visitId));
      if (expandedVisitId === visitId) setExpandedVisitId(null);
    } catch { }
  };

  const checkedCount = items.filter(i => i.rating !== null).length;
  const totalCount = items.length;

  const btnStyle = (active: boolean, col: { bg: string; color: string }): React.CSSProperties => ({
    width: '32px', height: '26px',
    border: `1.5px solid ${active ? col.bg : '#dadce0'}`,
    borderRadius: '6px',
    backgroundColor: active ? col.bg : '#fff',
    color: active ? col.color : '#5f6368',
    fontSize: '11px', fontWeight: active ? 700 : 400,
    cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0,
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        backgroundColor: '#fff', borderRadius: '14px',
        width: '600px', maxWidth: 'calc(100vw - 32px)',
        maxHeight: '86vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #e8eaed',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#202124' }}>임장 체크리스트</div>
            <div style={{ fontSize: '12px', color: '#80868b', marginTop: '3px' }}>
              {complexName} · {checkedCount}/{totalCount}개 체크됨
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '22px', color: '#80868b', padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* visitType 탭 */}
        <div style={{ display: 'flex', gap: '6px', padding: '12px 22px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          {VISIT_TYPES.map(vt => {
            const tabRated = items.filter(i => i.visitType === vt.key && i.rating !== null).length;
            const tabTotal = items.filter(i => i.visitType === vt.key).length;
            const isActive = activeTab === vt.key;
            const visitCount = vt.key === 'PROPERTY' ? visits.length : null;
            return (
              <button key={vt.key} onClick={() => setActiveTab(vt.key)}
                style={{
                  padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  border: '1.5px solid', borderColor: isActive ? '#1a73e8' : '#dadce0',
                  borderRadius: '16px',
                  backgroundColor: isActive ? '#1a73e8' : '#fff',
                  color: isActive ? '#fff' : '#5f6368',
                }}>
                {vt.label}
                {vt.key === 'PROPERTY' ? (
                  visitCount !== null && visitCount > 0 && (
                    <span style={{ marginLeft: '4px', fontSize: '10px', opacity: isActive ? 0.85 : 0.65 }}>{visitCount}건</span>
                  )
                ) : (
                  tabTotal > 0 && (
                    <span style={{ marginLeft: '4px', fontSize: '10px', opacity: isActive ? 0.85 : 0.65 }}>
                      {tabRated}/{tabTotal}
                    </span>
                  )
                )}
              </button>
            );
          })}
        </div>

        {/* 본문 */}
        {activeTab === 'PROPERTY' ? (
          /* 매물 임장 탭 */
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 22px' }}>
            {/* 추가 폼 */}
            {showAddForm && (
              <div style={{
                border: '1.5px solid #1a73e8', borderRadius: '10px',
                padding: '14px 16px', marginBottom: '14px', backgroundColor: '#f8fbff',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a73e8', marginBottom: '10px' }}>
                  {editingVisitId ? '매물 기록 수정' : '새 매물 기록 추가'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  {([
                    { label: '방문일',         key: 'visitDate',   type: 'date',   placeholder: '' },
                    { label: '부동산',         key: 'agentName',   type: 'text',   placeholder: '담당 부동산명' },
                    { label: '부동산 연락처',   key: 'officePhone', type: 'tel',    placeholder: '예: 02-1234-5678' },
                    { label: '휴대전화 연락처', key: 'mobilePhone', type: 'tel',    placeholder: '예: 010-1234-5678' },
                    { label: '동',             key: 'dong',        type: 'text',   placeholder: '예: 101 (동 자동추가)' },
                    { label: '호수',           key: 'hosu',        type: 'text',   placeholder: '예: 1501 (호 자동추가)' },
                    { label: '평형',           key: 'areaType',    type: 'text',   placeholder: '예: 59 (전용 자동추가)' },
                    { label: '금액(만원)',      key: 'price',       type: 'number', placeholder: '예: 90000' },
                  ] as const).map(({ label, key, type, placeholder }) => (
                    <div key={key}>
                      <div style={{ fontSize: '11px', color: '#5f6368', marginBottom: '3px' }}>{label}</div>
                      <input
                        type={type}
                        value={(form as any)[key]}
                        onChange={e => {
                          const v = e.target.value;
                          // 연락처는 입력 즉시 포맷 적용
                          const next = (key === 'officePhone' || key === 'mobilePhone') ? formatPhone(v) : v;
                          setForm(prev => ({ ...prev, [key]: next }));
                        }}
                        placeholder={placeholder}
                        style={{
                          width: '100%', fontSize: '12px', padding: '5px 8px',
                          border: '1px solid #dadce0', borderRadius: '6px', outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  ))}
                </div>
                {/* 구분선 — 부동산/매물 정보와 메모 경계 */}
                <hr style={{ border: 'none', borderTop: '1px solid #e8eaed', margin: '4px 0 10px' }} />
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#5f6368', marginBottom: '3px' }}>메모</div>
                  <textarea
                    ref={memoTextarea.ref}
                    value={form.memo}
                    onChange={e => handleMemoChange(e.target.value)}
                    onFocus={memoTextarea.onFocus}
                    onKeyDown={memoTextarea.onKeyDown}
                    onBlur={memoTextarea.onBlur}
                    onCompositionEnd={memoTextarea.onCompositionEnd}
                    placeholder="메모..."
                    rows={2}
                    style={{
                      width: '100%', fontSize: '12px', padding: '5px 8px',
                      border: '1px solid #dadce0', borderRadius: '6px', outline: 'none',
                      boxSizing: 'border-box', resize: 'none', overflow: 'hidden',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button onClick={() => { setShowAddForm(false); setEditingVisitId(null); }}
                    style={{ padding: '6px 14px', fontSize: '12px', border: '1px solid #dadce0', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}>취소</button>
                  <button onClick={handleFormSave} disabled={formSaving}
                    style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, border: 'none', borderRadius: '6px', backgroundColor: '#1a73e8', color: '#fff', cursor: 'pointer' }}>
                    {formSaving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            )}

            {/* 추가 버튼 */}
            {!showAddForm && (
              <button onClick={openAddForm}
                style={{
                  width: '100%', padding: '8px', fontSize: '12px', fontWeight: 600,
                  border: '1.5px dashed #1a73e8', borderRadius: '8px',
                  background: '#f8fbff', color: '#1a73e8', cursor: 'pointer', marginBottom: '12px',
                }}>
                + 새 매물 기록 추가
              </button>
            )}

            {/* 매물 카드 목록 */}
            {visitsLoading ? (
              <p style={{ color: '#9aa0a6', fontSize: '13px' }}>불러오는 중...</p>
            ) : visits.length === 0 ? (
              <p style={{ color: '#9aa0a6', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
                아직 기록된 매물 임장이 없습니다.<br />
                위 버튼으로 방문한 매물을 추가하세요.
              </p>
            ) : (
              visits.map(visit => {
                const isExpanded = expandedVisitId === visit.id;
                const ratedCount = visit.results.filter(r => r.rating !== null).length;
                const totalTemplates = visit.results.length;

                // 카테고리 그룹핑
                const catOrder: string[] = [];
                const catSeen = new Set<string>();
                for (const r of visit.results) {
                  const cat = r.category || '';
                  if (!catSeen.has(cat)) { catSeen.add(cat); catOrder.push(cat); }
                }
                const nocat = catOrder.indexOf('');
                if (nocat !== -1 && nocat !== catOrder.length - 1) {
                  catOrder.splice(nocat, 1); catOrder.push('');
                }
                const catMap = new Map<string, typeof visit.results>();
                for (const r of visit.results) {
                  const cat = r.category || '';
                  if (!catMap.has(cat)) catMap.set(cat, []);
                  catMap.get(cat)!.push(r);
                }

                return (
                  <div key={visit.id} style={{
                    border: '1px solid #e8eaed', borderRadius: '10px',
                    marginBottom: '10px', overflow: 'hidden',
                  }}>
                    {/* 카드 헤더 — 클릭 시 펼침/닫힘 */}
                    <div
                      onClick={() => setExpandedVisitId(isExpanded ? null : visit.id)}
                      style={{
                        padding: '10px 14px', cursor: 'pointer', userSelect: 'none',
                        backgroundColor: isExpanded ? '#f8fbff' : '#fff',
                        display: 'flex', alignItems: 'center', gap: '8px',
                      }}
                    >
                      <span style={{ fontSize: '12px', color: isExpanded ? '#1a73e8' : '#5f6368', flexShrink: 0 }}>
                        {isExpanded ? '▲' : '▼'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* 첫째 줄: 부동산·동/호수 */}
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#202124', marginBottom: '3px' }}>
                          {visit.agentName || '(부동산 미입력)'}
                          {(visit.dong || visit.hosu) && (
                            <span style={{ fontWeight: 400, color: '#5f6368', marginLeft: '8px' }}>
                              {[displayDong(visit.dong), displayHosu(visit.hosu)].filter(Boolean).join(' ')}
                            </span>
                          )}
                        </div>
                        {/* 둘째 줄: 평형·금액·날짜 */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {visit.areaType && (
                            <span style={{ fontSize: '11px', backgroundColor: '#e8f0fe', color: '#1a73e8', borderRadius: '4px', padding: '1px 6px' }}>
                              {displayArea(visit.areaType)}
                            </span>
                          )}
                          {visit.price != null && (
                            <span style={{ fontSize: '11px', color: '#202124', fontWeight: 600 }}>
                              {formatPrice(visit.price)}
                            </span>
                          )}
                          {visit.visitDate && (
                            <span style={{ fontSize: '11px', color: '#9aa0a6' }}>{visit.visitDate}</span>
                          )}
                          {totalTemplates > 0 && (
                            <span style={{ fontSize: '10px', color: '#9aa0a6', marginLeft: 'auto' }}>
                              체크 {ratedCount}/{totalTemplates}
                            </span>
                          )}
                        </div>
                        {/* 셋째 줄: 연락처 */}
                        {(visit.officePhone || visit.mobilePhone) && (
                          <div style={{ display: 'flex', gap: '10px', marginTop: '2px' }}>
                            {visit.officePhone && (
                              <span style={{ fontSize: '11px', color: '#5f6368' }}>📞 {visit.officePhone}</span>
                            )}
                            {visit.mobilePhone && (
                              <span style={{ fontSize: '11px', color: '#5f6368' }}>📱 {visit.mobilePhone}</span>
                            )}
                          </div>
                        )}
                      </div>
                      {/* 수정/삭제 버튼 */}
                      <button
                        onClick={e => { e.stopPropagation(); openEditForm(visit); }}
                        style={{ border: '1px solid #dadce0', borderRadius: '5px', background: '#fff', color: '#5f6368', fontSize: '11px', padding: '3px 7px', cursor: 'pointer', flexShrink: 0 }}
                      >✏</button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteVisit(visit.id); }}
                        style={{ border: '1px solid #fadbd8', borderRadius: '5px', background: '#fff', color: '#ea4335', fontSize: '11px', padding: '3px 7px', cursor: 'pointer', flexShrink: 0 }}
                      >×</button>
                    </div>

                    {/* 메모 */}
                    {visit.memo && !isExpanded && (
                      <div style={{ padding: '0 14px 8px', fontSize: '11px', color: '#5f6368', whiteSpace: 'pre-wrap' }}>{visit.memo}</div>
                    )}

                    {/* 체크리스트 펼침 영역 */}
                    {isExpanded && (
                      <div style={{ padding: '8px 14px 14px', borderTop: '1px solid #f0f0f0' }}>
                        {visit.memo && (
                          <div style={{ fontSize: '11px', color: '#5f6368', backgroundColor: '#f9f9f9', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px', whiteSpace: 'pre-wrap' }}>
                            {visit.memo}
                          </div>
                        )}
                        {totalTemplates === 0 ? (
                          <p style={{ fontSize: '12px', color: '#9aa0a6' }}>
                            체크리스트 항목이 없습니다. 헤더의 "체크리스트" 버튼에서 매물 항목을 추가하세요.
                          </p>
                        ) : (
                          catOrder.map(cat => {
                            const catItems = catMap.get(cat) || [];
                            if (catItems.length === 0) return null;
                            const catLabel = cat || '미분류';
                            return (
                              <div key={cat} style={{ marginBottom: '10px' }}>
                                {/* 카테고리가 2개 이상일 때만 헤더 표시 */}
                                {catOrder.length > 1 && (
                                  <div style={{
                                    fontSize: '10px', fontWeight: 700, color: '#5f6368',
                                    padding: '3px 0 4px', borderBottom: '1px solid #e8eaed',
                                    marginBottom: '4px', letterSpacing: '0.3px',
                                  }}>
                                    {catLabel}
                                  </div>
                                )}
                                {catItems.map(item => {
                                  const rating = item.rating ?? null;
                                  return (
                                    <div key={item.templateId} style={{
                                      display: 'flex', alignItems: 'center', gap: '6px',
                                      padding: '5px 0', borderBottom: '1px solid #f5f5f5',
                                    }}>
                                      <span style={{ flex: 1, fontSize: '12px', color: '#202124' }}>{item.itemName}</span>
                                      {(['UPPER', 'MIDDLE', 'LOWER'] as const).map(r => (
                                        <button key={r}
                                          onClick={() => handleVisitRate(visit, item.templateId, r)}
                                          style={btnStyle(rating === r, RATING_COLORS[r])}>
                                          {RATING_LABELS[r]}
                                        </button>
                                      ))}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* 분위기/단지 탭 */
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 22px' }}>
              {loading ? (
                <p style={{ color: '#9aa0a6', fontSize: '13px', padding: '12px 0' }}>불러오는 중...</p>
              ) : tabItems.length === 0 ? (
                <p style={{ color: '#9aa0a6', fontSize: '13px', padding: '12px 0' }}>
                  이 유형의 항목이 없습니다. 헤더의 "체크리스트" 버튼으로 항목을 추가하세요.
                </p>
              ) : (
                orderedCategories.map(cat => {
                  const catItems = itemsByCategory.get(cat) || [];
                  if (catItems.length === 0) return null;
                  const catLabel = cat || '미분류';
                  const catRated = catItems.filter(i => i.rating !== null).length;
                  return (
                    <div key={cat} style={{ marginBottom: '14px' }}>
                      {orderedCategories.length > 1 && (
                        <div style={{
                          fontSize: '11px', fontWeight: 700, color: '#5f6368',
                          padding: '5px 0 4px', borderBottom: '1.5px solid #e8eaed',
                          marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px',
                        }}>
                          {catLabel}
                          <span style={{ fontWeight: 400, color: '#bdbdbd' }}>{catRated}/{catItems.length}</span>
                        </div>
                      )}
                      {catItems.map(item => {
                        const rating = item.rating ?? null;
                        return (
                          <div key={item.templateId} style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '8px 0', borderBottom: '1px solid #f5f5f5',
                          }}>
                            <span style={{ flex: 1, fontSize: '13px', color: '#202124', lineHeight: 1.4 }}>
                              {item.itemName}
                            </span>
                            {(['UPPER', 'MIDDLE', 'LOWER'] as const).map(r => {
                              const active = rating === r;
                              const col = RATING_COLORS[r];
                              return (
                                <button key={r} onClick={() => handleRate(item.templateId, r)}
                                  style={{
                                    width: '36px', height: '30px',
                                    border: `1.5px solid ${active ? col.bg : '#dadce0'}`,
                                    borderRadius: '7px',
                                    backgroundColor: active ? col.bg : '#fff',
                                    color: active ? col.color : '#5f6368',
                                    fontSize: '12px', fontWeight: active ? 700 : 400,
                                    cursor: 'pointer', transition: 'all 0.12s',
                                  }}>
                                  {RATING_LABELS[r]}
                                </button>
                              );
                            })}
                            {!hasAnyRating && (
                              <button onClick={() => handleDelete(item.templateId, item.itemName)}
                                style={{
                                  border: '1px solid #fadbd8', borderRadius: '4px', background: '#fff',
                                  color: '#ea4335', fontSize: '14px', padding: '2px 7px',
                                  cursor: 'pointer', lineHeight: 1, flexShrink: 0,
                                }}>×</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            {/* 항목 추가 (분위기/단지 탭용) */}
            <div style={{ padding: '12px 22px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: '8px', flexShrink: 0 }}>
              <input
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd(); }}
                placeholder="항목 추가... (Enter)"
                style={{
                  flex: 1, fontSize: '13px', padding: '7px 10px',
                  border: '1px solid #dadce0', borderRadius: '8px', outline: 'none',
                }}
              />
              <button
                onClick={handleAdd}
                disabled={!newItemName.trim() || adding}
                style={{
                  padding: '7px 16px', fontSize: '13px', fontWeight: 600, border: 'none', borderRadius: '8px',
                  backgroundColor: newItemName.trim() ? '#1a73e8' : '#f1f3f4',
                  color: newItemName.trim() ? '#fff' : '#9aa0a6',
                  cursor: newItemName.trim() ? 'pointer' : 'not-allowed',
                }}>추가</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ChecklistModal;
