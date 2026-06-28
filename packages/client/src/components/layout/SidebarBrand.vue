<script setup lang="ts">
defineProps<{
  collapsed?: boolean
}>()
</script>

<template>
  <div class="sidebar-brand" :class="{ 'sidebar-brand--collapsed': collapsed }">
    <span class="sidebar-brand__glyph" aria-hidden="true">
      <!--
        Caduceus-inspired glyph: stylized winged staff with two opposing
        snake coils. Uses currentColor so it inverts with theme automatically.
      -->
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <!-- Top wings -->
        <path d="M12 3.5 C9.5 2.4 7 2.4 5 3.4" />
        <path d="M12 3.5 C14.5 2.4 17 2.4 19 3.4" />
        <!-- Central staff -->
        <line x1="12" y1="3.5" x2="12" y2="21" />
        <!-- Snake coils (two opposing waves) -->
        <path d="M6.5 10 Q12 8 17.5 10" />
        <path d="M6.5 14 Q12 16 17.5 14" />
        <path d="M6.5 18 Q12 16 17.5 18" />
      </svg>
    </span>
    <span v-if="!collapsed" class="sidebar-brand__title">Hermes UI</span>
  </div>
</template>

<style scoped>
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  margin: -12px -12px 12px;
  background: var(--background-card, #ffffff);
  border: 1px solid var(--border-main, rgba(15, 23, 42, 0.08));
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  user-select: none;
}

.sidebar-brand__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  color: var(--logo-color, #111827);
  transition: color 0.25s ease;
}

.sidebar-brand__title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--logo-color, #111827);
  transition: color 0.25s ease;
}

/* Hover lifts text brightness. No background hover. */
.sidebar-brand:hover .sidebar-brand__title {
  color: var(--text-primary, #000000);
}

/* Dark mode: brand text/icon match the Send button (pure #ffffff). */
:global(html[data-theme='dark']) .sidebar-brand__title,
:global(html.dark) .sidebar-brand__title {
  color: #ffffff;
}

:global(html[data-theme='dark']) .sidebar-brand__glyph,
:global(html.dark) .sidebar-brand__glyph {
  color: #ffffff;
}

:global(html[data-theme='dark']) .sidebar-brand:hover .sidebar-brand__title,
:global(html.dark) .sidebar-brand:hover .sidebar-brand__title {
  color: #ffffff;
  text-shadow: 0 0 1px rgba(255, 255, 255, 0.4);
}


.sidebar-brand--collapsed {
  justify-content: center;
  padding: 10px;
}
</style>