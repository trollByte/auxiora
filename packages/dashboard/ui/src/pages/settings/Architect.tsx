import { ArchitectSettings } from '../../components/ArchitectSettings';
import { api } from '../../api';

export function SettingsArchitect() {
  return (
    <div className="page">
      <h2>The Architect</h2>
      <ArchitectSettings
        loadPreferences={async () => {
          const res = await api.getArchitectPreferences();
          return res.data;
        }}
        updatePreference={async (key, value) => {
          await api.updateArchitectPreference(key, value);
        }}
        clearData={async () => {
          await api.clearArchitectData();
        }}
        exportData={async () => {
          const res = await api.exportArchitectData();
          return res.data;
        }}
      />
    </div>
  );
}
