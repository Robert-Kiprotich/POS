import React, { useState, useEffect } from 'react';
import ReactApexChart from "react-apexcharts";
import API from "../../../../../services/api";

function ApexSimple({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [sline, setSline] = useState<any>({
    chart: { height: 350, type: "line", zoom: { enabled: false }, toolbar: { show: false } },
    dataLabels: { enabled: false },
    stroke: { curve: "straight" },
    series: [{ name: "Conversations", data: [0, 0, 0, 0] }],
    grid: { row: { colors: ["#f1f2f3", "transparent"], opacity: 0.5 } },
    xaxis: { categories: ["WhatsApp", "Facebook", "Email", "Instagram"] },
    yaxis: { title: { text: "Conversations" } },
  });

  useEffect(() => {
    API.get(`statistics/?date_from=${dateFrom}&date_to=${dateTo}`).then(r => {
      if (!r.data?.success) return;
      const b = r.data.data.breakdown;
      setSline((p: any) => ({
        ...p,
        series: [{ name: "Conversations", data: [
          b.whatsapp?.conversations ?? 0,
          b.facebook?.conversations ?? 0,
          b.email?.conversations    ?? 0,
          b.instagram?.conversations ?? 0,
        ]}],
      }));
    }).catch(() => {});
  }, [dateFrom, dateTo]);

  return (
    <>
      <div className="col-md-6">
        <div className="card">
          <div className="card-header"><h5 className="card-title">Conversations by Channel</h5></div>
          <div className="card-body">
            <div id="s-line-area" />
            <ReactApexChart options={sline} series={sline.series} type="area" height={350} />
          </div>
        </div>
      </div>
    </>
  );
}

export default ApexSimple;
