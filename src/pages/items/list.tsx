import { ListView, ListViewHeader } from "@/components/refine-ui/views/list-view"
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";

const ItemList = () => {
    const [searchQuery, setSearchQuery] = useState('');
    return (
        <ListView>
            <ListViewHeader title="Inventory Items" />
            
        </ListView>
    )
}

export default ItemList