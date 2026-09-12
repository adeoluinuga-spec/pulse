import KpiWorkspace from "@/components/planning/KpiWorkspace";
export default async function KpisPage({searchParams}:{searchParams:Promise<{strategyNodeId?:string}>}) {
 const params=await searchParams;
 return <KpiWorkspace initialNodeId={params.strategyNodeId??""} />;
}
