import { useEffect, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { Icon } from './Icons';

interface UpdState {
  current: string;
  latest?: string;
  state: string; // idle | checking | none | available | downloading | ready | error | dev
  percent?: number;
  message?: string;
  checkedAt?: number;
}

const STATE_TEXT: Record<string, string> = {
  idle: '아직 확인하지 않았습니다',
  checking: '최신 버전 확인 중...',
  none: '최신 버전을 사용 중입니다',
  available: '새 버전을 내려받는 중...',
  downloading: '새 버전을 내려받는 중',
  ready: '새 버전이 준비되었습니다. 재시작하면 설치됩니다',
  error: '업데이트 확인에 실패했습니다',
  dev: '개발 실행에서는 업데이트를 쓸 수 없습니다 (설치된 Studio M에서 동작)',
};

function useUpdateState() {
  const [st, setSt] = useState<UpdState | null>(null);
  useEffect(() => {
    api.updateState().then(setSt);
    return api.onUpdateStatus((s: UpdState) => setSt(s));
  }, []);
  return st;
}

/** 상단 로고 옆: 현재 버전 + 업데이트 현황. 누르면 상황에 맞게 확인 / 다시 받기 / 설치 */
export function UpdateChip() {
  const st = useUpdateState();
  if (!st) return null;
  const newer = !!st.latest && st.latest !== st.current;
  let label = `v${st.current}`;
  let cls = '';
  let title = '눌러서 최신 버전 확인';
  let onClick: (() => void) | undefined = () => api.checkUpdate();
  if (st.state === 'dev') {
    label = '개발 실행';
    title = STATE_TEXT.dev;
    onClick = undefined;
  } else if (st.state === 'checking') {
    label += ' · 확인 중';
    title = STATE_TEXT.checking;
    onClick = undefined;
  } else if (st.state === 'available' || st.state === 'downloading') {
    label += ` → v${st.latest} 받는 중${st.percent != null ? ` ${Math.round(st.percent)}%` : ''}`;
    cls = ' busy';
    title = '새 버전을 내려받고 있습니다';
    onClick = undefined;
  } else if (st.state === 'ready') {
    label = `v${st.latest} 업데이트`;
    cls = ' ready';
    title = '눌러서 지금 설치하고 다시 시작';
    onClick = () => api.installUpdate();
  } else if (st.state === 'error') {
    if (newer) {
      label += ` → v${st.latest} 다시 받기`;
      onClick = () => api.downloadUpdate();
    } else label += ' · 확인 실패';
    cls = ' err';
    title = st.message ? `${STATE_TEXT.error}: ${st.message.split('\n')[0].slice(0, 120)}` : STATE_TEXT.error;
  } else if (st.state === 'none') {
    title = `최신 버전입니다${st.checkedAt ? ` (${new Date(st.checkedAt).toLocaleTimeString('ko-KR', { timeStyle: 'short' })} 확인)` : ''} · 눌러서 다시 확인`;
  }
  return (
    <button className={'ver-chip' + cls} title={title} disabled={!onClick} onClick={onClick}>
      {st.state === 'ready' && <Icon name="update" size={13} />}
      {label}
    </button>
  );
}

/** 설정 › 버전·업데이트: 설치 버전, 최신 버전, 수동 확인·업데이트 버튼 */
export function UpdateCard() {
  const st = useUpdateState();
  if (!st) return null;
  const busy = st.state === 'checking' || st.state === 'available' || st.state === 'downloading';
  const newer = !!st.latest && st.latest !== st.current;
  return (
    <div className="set-card">
      <h3>버전·업데이트</h3>
      <div className="set-row">
        <span>설치된 버전</span>
        <b>v{st.current}</b>
      </div>
      <div className="set-row">
        <span>최신 버전</span>
        <b>{st.latest ? `v${st.latest}` : '—'}</b>
        {st.checkedAt && <small className="muted">{new Date(st.checkedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })} 확인</small>}
      </div>
      <div className="set-row">
        <span className={st.state === 'error' ? 'err-text' : 'muted'}>
          {STATE_TEXT[st.state] || st.state}
          {st.state === 'downloading' && st.percent != null ? ` (${Math.round(st.percent)}%)` : ''}
          {st.state === 'error' && st.message ? ` — ${st.message.split('\n')[0].slice(0, 120)}` : ''}
        </span>
      </div>
      <div className="set-row">
        <button className="btn ghost" disabled={busy || st.state === 'dev'} onClick={() => api.checkUpdate()}>
          최신 버전 확인
        </button>
        {st.state === 'ready' ? (
          <button className="btn primary" onClick={() => api.installUpdate()}>
            지금 업데이트 (재시작)
          </button>
        ) : (
          newer &&
          st.state === 'error' && (
            <button className="btn primary" onClick={() => api.downloadUpdate()}>
              다시 내려받기
            </button>
          )
        )}
      </div>
      <small className="muted">앱을 켤 때 자동으로 확인하고 새 버전을 내려받습니다. 받은 업데이트는 앱을 닫을 때 설치되며, 「지금 업데이트」로 바로 설치할 수도 있습니다.</small>
    </div>
  );
}

export default function UpdateBanner() {
  const [st, setSt] = useState<any>(null);
  useEffect(
    () =>
      api.onUpdateStatus((s: any) => {
        setSt(s);
        const t = useStore.getState().showToast;
        if (s.state === 'none') t('최신 버전을 사용 중입니다');
        if (s.state === 'dev') t('개발 모드에서는 업데이트를 확인할 수 없습니다');
        if (s.state === 'available') t(`새 버전 ${s.version} 다운로드 중...`);
        if (s.state === 'error') console.warn('update error', s.message);
      }),
    [],
  );
  if (!st || st.state !== 'ready') return null;
  return (
    <div className="update-banner">
      <Icon name="update" size={16} />
      <span>새 버전 v{st.version}이(가) 준비되었습니다.</span>
      <button onClick={() => api.installUpdate()}>재시작하여 업데이트</button>
      <button className="ghost" onClick={() => setSt(null)}>
        나중에
      </button>
    </div>
  );
}
