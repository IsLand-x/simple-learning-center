import { useState } from 'react';

export function useSettingsPageStore() {
  const [activeTab, setActiveTab] = useState('models');
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  return { activeTab, setActiveTab, editingConfigId, setEditingConfigId };
}
