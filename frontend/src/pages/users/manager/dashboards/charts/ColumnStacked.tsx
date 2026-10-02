import React, { useState, useEffect } from 'react';
import ReactApexChart from "react-apexcharts";
import API from "../../../../../services/api";

function ColumnStacked({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [sColStacked, setSColStacked] = useState<any>({
    chart: { height: 350, type: "bar", stacked: true, toolbar: { show: false } },
    responsive: [{ breakpoint: 480, options: { legend: { position: "bottom", offsetX: -10, offsetY: 0 } } }],
    plotOptions: { bar: { horizontal: false } },
    series: [
      { name: "Open",     data: [0, 0, 0, 0] },
      { name: "Assigned", data: [0, 0, 0, 0] },
      { name: "Pending",  data: [0, 0, 0, 0] },
      { name: "Resolved", data: [0, 0, 0, 0] },
    ],
    xaxis: { categories: ["WhatsApp", "Facebook", "Email", "Instagram"] },
    legend: { position: "right", offsetY: 40 },
    fill: { opacity: 1 },
  });

  useEffect(() => {
    API.get(`conversations/?date_from=${dateFrom}&date_to=${dateTo}`).then(r => {
      const convs: any[] = r.data?.results ?? [];
      const channels = ["whatsapp", "facebook", "email", "instagram"];
      const statuses = ["open", "assigned", "pending", "resolved"];
      const counts: Record<string, Record<string, number>> = {};
      channels.forEach(ch => { counts[ch] = {}; statuses.forEach(s => { counts[ch][s] = 0; }); });
      convs.forEach((c: any) => {
        if (counts[c.channel] && counts[c.channel][c.status] !== undefined) counts[c.channel][c.status]++;
      });
      setSColStacked((p: any) => ({
        ...p,
        series: statuses.map(s => ({
          name: s.charAt(0).toUpperCase() + s.slice(1),
          data: channels.map(ch => counts[ch][s]),
        })),
      }));
    }).catch(() => {});
  }, [dateFrom, dateTo]);

  return (
    <>
      <div className="col-md-6">
        <div className="card">
          <div className="card-header"><h5 className="card-title">Conversations by Status &amp; Channel</h5></div>
          <div className="card-body">
            <div id="s-col-stacked" />
            <ReactApexChart options={sColStacked} series={sColStacked.series} type="bar" height={350} />
          </div>
        </div>
      </div>
    </>
  );
}

export default ColumnStacked;
