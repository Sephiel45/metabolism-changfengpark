Large Gaussian splat files (.ply) under public/resources/scans/ are omitted from the "LITE" zip to keep the download small.

Copy the scan .ply files into:

  public/resources/scans/

Minimum set used by the map viewer (see src/MapScanSection.tsx):

  gs_Changfeng_Park_Pavillion.ply
  gs_Changfeng_Park_2.ply
  gs_Changfeng_Park_Pavilion_3.ply

Optional (same folder as the full GS Visualizer export):

  gs_Changfeng_park_1.ply
  gs_Changfeng_Park_3.ply
  gs_Changfeng_Park_Pavilion_2.ply

Typical source folder on the author's machine:

  D:\Web\GS Visualizer\resources\scans\

Then: npm install   (use: npm install --legacy-peer-deps if npm warns about Spark/Three peers)
Then: npm run dev
