import Link from 'next/link'
import Image from 'next/image'

const Navbar = () => {
  return (
    <nav className="bg-white shadow-sm">
      <div className="container py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/assets/images/output.svg"
              alt="blinkywink"
              width={64}
              height={64}
              className="h-16 w-auto"
            />
          </Link>
          
          <div className="hidden md:flex space-x-8">
            <Link href="/products" className="text-gray-700 hover:text-black font-medium">
              All Products
            </Link>
            <Link href="/category/hoodies" className="text-gray-700 hover:text-black font-medium">
              Hoodies
            </Link>
            <Link href="/category/shirts" className="text-gray-700 hover:text-black font-medium">
              Shirts
            </Link>
            <Link href="/search" className="text-gray-700 hover:text-black font-medium">
              Search
            </Link>
          </div>
          
          <div className="md:hidden">
            <button className="text-gray-700 hover:text-black">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navbar 