<script setup lang="ts">
import HeroSection from '@/components/landing/HeroSection.vue'
import ScreenshotsSection from '@/components/landing/ScreenshotsSection.vue'
import FeaturesGrid from '@/components/landing/FeaturesGrid.vue'
import InstallSection from '@/components/landing/InstallSection.vue'
</script>

<template>
  <div class="landing">
    <HeroSection />
    <section id="download" class="download-section">
      <InstallSection />
    </section>
    <ScreenshotsSection />
    <FeaturesGrid />
  </div>
</template>

<style scoped lang="scss">
.landing {
  background: #f7f8fa;
}

.download-section {
  width: 100%;
  padding: 76px 18px 20px;
  background: transparent;

  @media (max-width: $breakpoint-mobile) {
    padding: 42px 10px 8px;
  }
}
</style>
