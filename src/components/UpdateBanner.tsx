import { useEffect, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { Icon } from './Icons';

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
