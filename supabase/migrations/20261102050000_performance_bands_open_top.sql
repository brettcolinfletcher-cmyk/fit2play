-- Top (Elite) bands were stored with max 999 as a stand-in for "no upper limit",
-- which is below the minimum for IMTP (3500 N) and some dynamometry values.
update public.performance_bands set max_value = null where max_value = 999 and band_label = 'Elite';
