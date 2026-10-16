Three.js r128 (MIT, see LICENSE), kept here so the page loads no script from another site.

- three.module.js: https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js, unchanged
- OrbitControls.js: https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/controls/OrbitControls.js, with one change:
  its import from 'three' points at ./three.module.js with the Keystone version stamp, so both load the same copy

To upgrade, download the same two files for the new release, repeat that one change, and check the 3D page.
