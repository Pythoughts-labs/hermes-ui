export interface DoubaoTtsVoiceOption {
  label: string
  value: string
  resourceId: string
}

export const DOUBAO_TTS_2_RESOURCE_ID = 'seed-tts-2.0'
export const DOUBAO_TTS_DEFAULT_VOICE = 'zh_female_xiaohe_uranus_bigtts'

export const DOUBAO_TTS_VOICE_OPTIONS: DoubaoTtsVoiceOption[] = [
  {
    label: 'Xiaohe 2.0',
    value: DOUBAO_TTS_DEFAULT_VOICE,
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Vivi 2.0',
    value: 'zh_female_vv_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Yunzhou 2.0',
    value: 'zh_male_m191_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Xiaotian 2.0',
    value: 'zh_male_taocheng_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Liufei 2.0',
    value: 'zh_male_liufei_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Charming Sophie 2.0',
    value: 'zh_male_sophie_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Fresh Female 2.0',
    value: 'zh_female_qingxinnvsheng_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Refined Cancan 2.0',
    value: 'zh_female_cancan_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Cute Junior 2.0',
    value: 'zh_female_sajiaoxuemei_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Sweet Xiaoyuan 2.0',
    value: 'zh_female_tianmeixiaoyuan_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Sweet Taozi 2.0',
    value: 'zh_female_tianmeitaozi_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Frank Sisi 2.0',
    value: 'zh_female_shuangkuaisisi_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Peppa Pig 2.0',
    value: 'zh_female_peiqi_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Girl Next Door 2.0',
    value: 'zh_female_linjianvhai_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Young Zixin 2.0',
    value: 'zh_male_shaonianzixin_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Monkey 2.0',
    value: 'zh_male_sunwukong_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Tina 2.0',
    value: 'zh_female_yingyujiaoxue_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Warm Sun Female 2.0',
    value: 'zh_female_kefunvsheng_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: "Children's Storybook 2.0",
    value: 'zh_female_xiaoxue_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Dayi 2.0',
    value: 'zh_male_dayi_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Black Cat Detective Mizai 2.0',
    value: 'zh_female_mizai_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Chicken Soup Female 2.0',
    value: 'zh_female_jitangnv_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Charming Girlfriend 2.0',
    value: 'zh_female_meilinvyou_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Smooth Female 2.0',
    value: 'zh_female_liuchangnv_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Elegant Yichen 2.0',
    value: 'zh_male_ruyayichen_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Timen 2.0',
    value: 'timen_male_tim_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Dacey 2.0',
    value: 'en_female_dacey_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
  {
    label: 'Stokie 2.0',
    value: 'en_female_stokie_uranus_bigtts',
    resourceId: DOUBAO_TTS_2_RESOURCE_ID,
  },
]

export function doubaoTtsResourceForVoice(voice: string): string {
  return DOUBAO_TTS_VOICE_OPTIONS.find(option => option.value === voice)?.resourceId || ''
}
