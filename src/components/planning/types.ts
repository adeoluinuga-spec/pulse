import type { NodeKind, MeasureType, Direction, Strategy, RollupResult } from "@/lib/strategyCascade";
export type Person = {id:string;name:string|null;email:string|null};
export type StrategyRow = {
 id:string;parent_id:string|null;kind:NodeKind;custom_kind_label:string|null;title:string;description:string|null;owner_id:string|null;
 measure:string|null;measure_type:MeasureType;measure_direction:Direction;baseline_value:number|null;target_value:number|null;current_value:number|null;
 unit:string|null;strategies:Strategy[];start_date:string|null;due_date:string|null;weight:number;status:string;period_label:string|null;rollup:RollupResult|null;
};
export type StrategyData={canEdit:boolean;people:Person[];nodes:StrategyRow[];
 goals:Array<{id:string;title:string;owner_id:string|null;strategy_node_id:string|null;appraisal_cycle_id:string|null;percent_complete:number|null}>;
 kpis:Array<{id:string;name:string;employee_id:string|null;strategy_node_id:string|null;current_value:number|null;target_value:number|null}>};
export type KpiRow={id:string;name:string;employee_id:string;strategy_node_id:string|null;description:string|null;unit:string|null;baseline_value:number|null;
 target_value:number;current_value:number;weight:number;measure_direction:"higher"|"lower";frequency:string;cycle:string|null;is_active:boolean;appraisal_cycle_id:string|null;
 trend:string|null;editable:{allowed:boolean;reason?:string}};
export type KpiData={viewer:{employeeId:string;role:string|null;directReportIds:string[]};people:Person[];kpis:KpiRow[]};
