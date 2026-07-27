UPDATE menu_item
SET is_visible = false,
    updated_at = now()
WHERE code IN ('search', 'sources')
  AND is_visible = true;
