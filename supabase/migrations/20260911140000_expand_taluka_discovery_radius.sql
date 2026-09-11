-- Public category discovery is Taluka-centre based when a customer chooses a
-- Taluka (rather than device GPS). Keep a useful local marketplace radius so
-- a nearby Taluka's vendors do not disappear simply because it fell outside
-- the previous eight-neighbour cache. This remains bounded and uses only
-- actual stored Taluka centroids.
select private.rebuild_taluka_neighbors_internal(
  null,
  25,
  100
);
